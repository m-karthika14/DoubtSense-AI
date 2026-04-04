const Content = require('../models/Content');
const Context = require('../models/Context');
const fs = require('fs');
const { cleanText, splitIntoSections } = require('../utils/textProcessing');
const { extractFromUploadedFile } = require('../utils/fileExtraction');
const { detectTopicSmart } = require('../utils/topicDetection');
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
    let rawTextForStorage = '';
    if (Array.isArray(extracted.sections)) {
      // PPTX: treat each slide as one section.
      const MIN_PPTX_SECTION_LEN = Number(process.env.UPLOAD_PPTX_MIN_CHARS || 1);
      const effectiveMin = Number.isFinite(MIN_PPTX_SECTION_LEN) && MIN_PPTX_SECTION_LEN >= 0 ? MIN_PPTX_SECTION_LEN : 1;

      // Store the raw extracted slide text (unmodified) for exact persistence.
      rawTextForStorage = extracted.sections.map((t) => String(t || '')).join('\n\n');

      sections = extracted.sections
        .map((t) => cleanText(t))
        .filter((t) => Boolean(t) && t.length >= effectiveMin);
    } else {
      // PDF/DOCX: common pipeline.
      // Store the raw extracted text (unmodified) for exact persistence.
      rawTextForStorage = typeof extracted.rawText === 'string' ? extracted.rawText : String(extracted.rawText || '');

      const cleaned = cleanText(extracted.rawText);
      sections = splitIntoSections(cleaned);
    }

    // IMPORTANT: store everything by default.
    // Truncation is only applied if UPLOAD_MAX_SECTIONS is explicitly set.
    const explicitMax = typeof process.env.UPLOAD_MAX_SECTIONS === 'string' && process.env.UPLOAD_MAX_SECTIONS.trim().length > 0;
    const configuredMax = explicitMax ? Number(process.env.UPLOAD_MAX_SECTIONS) : NaN;
    const effectiveMaxSections = explicitMax && Number.isFinite(configuredMax) && configuredMax > 0 ? configuredMax : null;

    const sectionsTotal = sections.length;
    const wasTruncated = Boolean(effectiveMaxSections && sections.length > effectiveMaxSections);
    if (wasTruncated) sections = sections.slice(0, effectiveMaxSections);

    if (sections.length === 0) {
      return res.status(400).json({ message: 'No readable text found in this file' });
    }

    // Detect ONE topic label for the whole uploaded document.
    // This is more stable than per-section keyword matching and avoids false positives
    // (e.g., matching "graph" inside "photograph").
    const firstCombined = sections.slice(0, Math.min(10, sections.length)).join('\n\n');
    const detected = await detectTopicSmart(firstCombined, { fallbackTitle: title });
    const docTopic = detected && typeof detected.topic === 'string' && detected.topic.trim()
      ? detected.topic.trim()
      : 'General';

    const contentMap = sections.map((sectionText, index) => {
      const difficulty = difficultyFromTextLength(sectionText);
      return {
        sectionId: `s${index + 1}`,
        topic: docTopic,
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
      rawText: rawTextForStorage,
      contentMap,
      fileType: extracted.fileType,
      sectionsTotal,
      wasTruncated,
    });

    const first = contentMap[0];
    const now = new Date();
    const initialActiveTopic = docTopic;

    const context = await Context.findOneAndUpdate(
      { userId },
      {
        userId,
        activeTopic: initialActiveTopic,
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
      sectionsTotal,
      sectionsStored: contentMap.length,
      wasTruncated,
      context,
    });
  } catch (err) {
    console.error('[upload] error', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

module.exports = { uploadPdf };
