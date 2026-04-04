const Content = require('../models/Content');
const Context = require('../models/Context');
const WebContextEvent = require('../models/WebContextEvent');
const { detectTopic } = require('../utils/topicDetection');
const { cleanText } = require('../utils/textProcessing');
const { difficultyFromTextLength } = require('../utils/difficulty');

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function normalizeHeadings(headings) {
  if (!Array.isArray(headings)) return [];
  return headings
    .map((h) => String(h || '').trim())
    .filter(Boolean)
    .slice(0, 50); // keep payload bounded
}

async function postContext(req, res) {
  try {
    const userId = String(req.body.userId || '').trim();
    if (!userId) return res.status(400).json({ message: 'userId is required' });

    const now = new Date();

    // INTERNAL MODE
    if (isNonEmptyString(req.body.topic)) {
      const topic = String(req.body.topic).trim();
      const sectionId = isNonEmptyString(req.body.sectionId) ? String(req.body.sectionId).trim() : undefined;
      const incomingContentId = isNonEmptyString(req.body.contentId) ? String(req.body.contentId).trim() : undefined;

      if (!sectionId) {
        return res.status(400).json({ message: 'sectionId is required for internal mode' });
      }

      const metadata = req.body.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : {};
      const title = isNonEmptyString(metadata.title) ? String(metadata.title).trim() : undefined;

      const update = {
        userId,
        activeTopic: topic,
        sourceType: 'internal',
        sectionId,
        metadata: { title },
        lastUpdated: now,
      };

      // Important: don't wipe out uploaded contentId when tracking reading position.
      // Allow client to pass contentId (best), otherwise keep existing contentId.
      if (incomingContentId) {
        update.contentId = incomingContentId;
      }

      const context = await Context.findOneAndUpdate(
        { userId },
        update,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      return res.json({ context });
    }

    // WEBSITE MODE
    const title = isNonEmptyString(req.body.title) ? String(req.body.title).trim() : undefined;
    const url = isNonEmptyString(req.body.url) ? String(req.body.url).trim() : undefined;
    const paragraph = isNonEmptyString(req.body.paragraph) ? String(req.body.paragraph) : '';
    const headings = normalizeHeadings(req.body.headings);

    if (!url) return res.status(400).json({ message: 'url is required for website mode' });

    const combinedText = cleanText(`${headings.join(' ')}\n${paragraph}`);
    const { topic } = detectTopic(combinedText);

    const importantContent = req.body.importantContent === true;

    // Shadow-copy for reference (should not affect the primary Context behavior).
    const MAX_PARAGRAPH_CHARS = 2000;
    const boundedParagraph = paragraph.length > MAX_PARAGRAPH_CHARS ? paragraph.slice(0, MAX_PARAGRAPH_CHARS) : paragraph;
    const source = req.body && req.body.source === 'extension' ? 'extension' : 'website';

    try {
      await WebContextEvent.create({
        userId,
        topic,
        title: title || '',
        url,
        headings,
        paragraph: boundedParagraph,
        importantContent,
        source,
      });
    } catch (e) {
      // Non-fatal: still allow Context update path to continue.
      console.warn('[context] Failed to persist WebContextEvent');
    }

    let contentId;
    if (importantContent) {
      const difficulty = difficultyFromTextLength(combinedText);
      const contentDoc = await Content.create({
        userId,
        sourceType: 'website',
        title: title || url,
        sourceUrl: url,
        contentMap: [
          {
            sectionId: 'main',
            topic,
            text: combinedText,
            difficulty,
          },
        ],
      });
      contentId = contentDoc._id;
    }

    // Keep study context stable: if the user is currently in an upload/internal session,
    // don't overwrite it with website browsing context. (Web browsing is stored in WebContextEvent.)
    const existing = await Context.findOne({ userId }).lean();
    const shouldUpdatePrimaryContext = !existing || existing.sourceType === 'website';

    if (!shouldUpdatePrimaryContext) {
      return res.json({ context: existing, contentId });
    }

    const context = await Context.findOneAndUpdate(
      { userId },
      {
        userId,
        activeTopic: topic,
        headings,
        title: title || '',
        paragraph,
        sourceType: 'website',
        contentId: contentId || null,
        sectionId: 'main',
        metadata: { title, url },
        lastUpdated: now,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.json({ context, contentId });
  } catch (err) {
    console.error('[context] error', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function getContext(req, res) {
  try {
    const userId = String(req.query.userId || '').trim();
    if (!userId) return res.status(400).json({ message: 'userId is required' });

    const context = await Context.findOne({ userId });
    return res.json({ context });
  } catch (err) {
    console.error('[context] get error', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

module.exports = { postContext, getContext };
