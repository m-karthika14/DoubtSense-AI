const Content = require('../models/Content');
const Context = require('../models/Context');
const fs = require('fs');
const { cleanText, splitIntoSections } = require('../utils/textProcessing');
const { extractFromUploadedFile } = require('../utils/fileExtraction');
const { detectTopic } = require('../utils/topicDetection');
const { difficultyFromTextLength } = require('../utils/difficulty');

function normalizeSourceType(sourceType) {
  if (sourceType === 'external_pdf') return 'external_pdf';
  return 'upload';
}

async function uploadPdf(req, res) {
  try {
    const userId = String(req.body.userId || '').trim();
    const sourceType = normalizeSourceType(req.body.sourceType);
    const sourceUrl = req.body.sourceUrl ? String(req.body.sourceUrl) : undefined;

    if (!userId) return res.status(400).json({ message: 'userId is required' });

    const file = req.file;
    if (!file) return res.status(400).json({ message: 'file is required (field name: file)' });

    const fileUrl = file && file.filename ? `/uploads/${file.filename}` : undefined;

    const originalName = file.originalname || 'uploaded.pdf';
    const title = String(req.body.title || originalName).trim();

    let extracted;
    try {
      // multer diskStorage does not provide a buffer; read the stored file for extraction
      const buffer = file.buffer ? file.buffer : fs.readFileSync(file.path);
      extracted = await extractFromUploadedFile({ ...file, buffer });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unable to extract text';
      return res.status(400).json({ message: `Unable to extract text from file: ${message}` });
    }

    if (extracted && extracted.validationError) {
      return res.status(400).json({ message: extracted.validationError });
    }
    if (!extracted.fileType) {
      return res.status(400).json({ message: 'Only PDF (.pdf), Word (.docx), and PowerPoint (.pptx) uploads are supported' });
    }

    let sections;
    if (Array.isArray(extracted.sections)) {
      // PPTX: treat each slide as one section.
      const MIN_PPTX_SECTION_LEN = 25;
      sections = extracted.sections
        .map((t) => cleanText(t))
        .filter((t) => Boolean(t) && t.length >= MIN_PPTX_SECTION_LEN);
    } else {
      // PDF/DOCX: common pipeline.
      const cleaned = cleanText(extracted.rawText);
      sections = splitIntoSections(cleaned);
    }

    const MAX_SECTIONS = 200;
    if (sections.length > MAX_SECTIONS) sections = sections.slice(0, MAX_SECTIONS);

    if (sections.length === 0) {
      return res.status(400).json({ message: 'No readable text found in this file' });
    }

    const contentMap = sections.map((sectionText, index) => {
      const { topic } = detectTopic(sectionText);
      const difficulty = difficultyFromTextLength(sectionText);
      return {
        sectionId: `s${index + 1}`,
        topic,
        text: sectionText,
        difficulty,
      };
    });

    const contentDoc = await Content.create({
      userId,
      sourceType,
      title,
      sourceUrl,
      fileUrl,
      contentMap,
    });

    const first = contentMap[0];
    const now = new Date();

    const context = await Context.findOneAndUpdate(
      { userId },
      {
        userId,
        activeTopic: first ? first.topic : 'General',
        sourceType,
        contentId: contentDoc._id,
        sectionId: first ? first.sectionId : undefined,
        metadata: {
          title,
          url: sourceUrl,
        },
        lastUpdated: now,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.json({
      contentId: contentDoc._id,
      fileUrl,
      contentMap,
      sectionsStored: contentMap.length,
      context,
    });
  } catch (err) {
    console.error('[upload] error', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

module.exports = { uploadPdf };
