/* eslint-disable no-console */
// One-time maintenance script:
// - Backfills Content.rawText for older uploads (join contentMap section texts)
// - Normalizes Content.contentMap[*].topic to a single doc-level topic
// - Updates Context.activeTopic for contexts pointing at that Content
//
// Usage:
//   node scripts/backfillContentRawText.js --userId <USER_ID>
//   node scripts/backfillContentRawText.js --all
// Optional:
//   --dryRun (prints what would change)

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const Content = require('../src/models/Content');
const Context = require('../src/models/Context');
const { detectTopicSmart } = require('../src/utils/topicDetection');

function parseArgs(argv) {
  const args = { userId: '', all: false, dryRun: false };
  for (let i = 2; i < argv.length; i += 1) {
    const a = String(argv[i] || '').trim();
    if (a === '--userId') {
      args.userId = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }
    if (a === '--all') {
      args.all = true;
      continue;
    }
    if (a === '--dryRun') {
      args.dryRun = true;
      continue;
    }
  }
  return args;
}

function inferFileTypeFromTitle(title) {
  const t = typeof title === 'string' ? title.trim().toLowerCase() : '';
  if (t.endsWith('.pdf')) return 'pdf';
  if (t.endsWith('.pptx')) return 'pptx';
  if (t.endsWith('.docx') || t.endsWith('.doc')) return 'docx';
  return undefined;
}

function joinRawTextFromContentMap(contentMap) {
  const map = Array.isArray(contentMap) ? contentMap : [];
  const parts = map
    .map((s) => (s && typeof s.text === 'string' ? s.text.trim() : ''))
    .filter(Boolean);
  return parts.join('\n\n---\n\n').trim();
}

async function main() {
  const { userId, all, dryRun } = parseArgs(process.argv);
  if (!all && !userId) {
    console.error('Provide --userId <USER_ID> or --all');
    process.exit(1);
  }

  await connectDB(process.env.MONGODB_URI);

  const query = {
    sourceType: { $in: ['upload', 'external_pdf'] },
  };
  if (!all) query.userId = userId;

  // Only touch docs that are missing rawText or have an empty rawText.
  query.$or = [{ rawText: { $exists: false } }, { rawText: '' }, { rawText: null }];

  const docs = await Content.find(query).sort({ createdAt: -1 });
  console.log(`[backfill] Found ${docs.length} Content docs to backfill`);

  let updatedCount = 0;

  for (const doc of docs) {
    const contentId = String(doc._id);
    const map = Array.isArray(doc.contentMap) ? doc.contentMap : [];
    const joined = joinRawTextFromContentMap(map);

    if (!joined) {
      console.warn('[backfill] Skip (no text in contentMap):', contentId, doc.title);
      continue;
    }

    // Detect a doc-level topic from the joined text (deterministic + schema constrained).
    // Use title as a fallback hint.
    const detected = await detectTopicSmart(joined.slice(0, 8000), { fallbackTitle: doc.title });
    const docTopic = detected && typeof detected.topic === 'string' && detected.topic.trim()
      ? detected.topic.trim()
      : 'General';

    const next = {
      rawText: joined,
      sectionsTotal: typeof doc.sectionsTotal === 'number' ? doc.sectionsTotal : map.length,
      wasTruncated: typeof doc.wasTruncated === 'boolean' ? doc.wasTruncated : false,
      fileType: doc.fileType || inferFileTypeFromTitle(doc.title),
    };

    // Normalize all section topics to docTopic.
    const needsTopicNormalize = map.some((s) => s && typeof s.topic === 'string' && s.topic.trim() !== docTopic);

    console.log('[backfill] Update:', {
      contentId,
      userId: doc.userId,
      title: doc.title,
      docTopic,
      rawTextChars: joined.length,
      normalizeSectionTopics: needsTopicNormalize,
      dryRun,
    });

    if (!dryRun) {
      doc.rawText = next.rawText;
      doc.sectionsTotal = next.sectionsTotal;
      doc.wasTruncated = next.wasTruncated;
      doc.fileType = next.fileType;

      if (needsTopicNormalize) {
        doc.contentMap = map.map((s) => ({
          ...s.toObject?.() || s,
          topic: docTopic,
        }));
      }

      await doc.save();

      // Update any Context pointing at this content.
      await Context.updateMany(
        { contentId: doc._id },
        { $set: { activeTopic: docTopic, lastUpdated: new Date() } }
      );

      updatedCount += 1;
    }
  }

  console.log(`[backfill] Done. Updated ${updatedCount}/${docs.length}`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('[backfill] Fatal:', err && err.message ? err.message : err);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
