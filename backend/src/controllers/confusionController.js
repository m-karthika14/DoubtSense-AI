const ConfusionEvent = require('../models/ConfusionEvent');
const mongoose = require('mongoose');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function parseUnixSecondsToDate(ts) {
  const n = typeof ts === 'number' ? ts : Number(ts);
  if (!Number.isFinite(n)) return null;
  // treat it as seconds
  return new Date(n * 1000);
}

const SCORE_HISTORY_WINDOW = 3;

function parseEnvNumber(name, fallback) {
  const raw = typeof process.env[name] === 'string' ? process.env[name].trim() : '';
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

const CONFUSION_THRESHOLD = parseEnvNumber('CONFUSION_THRESHOLD', 0.6);
const LR_WEIGHT = parseEnvNumber('CONFUSION_LR_WEIGHT', 0.4);
const RF_WEIGHT = parseEnvNumber('CONFUSION_RF_WEIGHT', 0.6);
const ML_TIMEOUT_MS = 1500;

// userId -> { scores: number[], lastUpdatedMs: number }
const confusionScoreHistoryByUser = new Map();

function clamp01(x) {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function normalizeWeights(lrW, rfW) {
  const a = Number.isFinite(lrW) ? lrW : 0;
  const b = Number.isFinite(rfW) ? rfW : 0;
  const s = a + b;
  if (s <= 0) return { lrW: 0.4, rfW: 0.6 };
  return { lrW: a / s, rfW: b / s };
}

function confidenceBand(score) {
  if (score > 0.7) return 'strong';
  if (score >= 0.5) return 'uncertain';
  return 'low';
}

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function coerceFiniteNumber(x) {
  const n = typeof x === 'number' ? x : Number(x);
  if (!Number.isFinite(n)) return null;
  return n;
}

function getCsvPath() {
  // backend/src/controllers -> repoRoot/project/data/behavior_data.csv
  return path.resolve(__dirname, '../../../project/data/behavior_data.csv');
}

async function ensureCsvHeader(csvPath) {
  await fsp.mkdir(path.dirname(csvPath), { recursive: true });
  try {
    const st = await fsp.stat(csvPath);
    if (st.size > 0) return;
  } catch {
    // file doesn't exist
  }

  const header = 'timestamp,userId,pauseTime,scrollSpeed,reReadCount,attentionScore,fatigueScore,label\n';
  await fsp.writeFile(csvPath, header, { encoding: 'utf-8' });
}

async function appendCsvRow({
  userId,
  vector,
  label,
  timestampMs,
}) {
  const csvPath = getCsvPath();
  await ensureCsvHeader(csvPath);

  const safeUserId = String(userId || '').replace(/[\r\n]/g, '');
  const row = `${timestampMs},${safeUserId},${vector.join(',')},${label}\n`;
  await fsp.appendFile(csvPath, row, { encoding: 'utf-8' });
}

async function postMlPredict(features) {
  const base = typeof process.env.ML_SERVICE_URL === 'string' ? process.env.ML_SERVICE_URL.trim() : '';
  const url = base || 'http://localhost:8000/predict';

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ML_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ features }),
      signal: controller.signal,
    });

    const data = await resp.json().catch(() => null);
    if (!resp.ok || !data || typeof data !== 'object') {
      throw new Error(`ML response not ok (${resp.status})`);
    }
    return data;
  } finally {
    clearTimeout(id);
  }
}

function pushScoreForUser(userId, score) {
  const now = Date.now();

  // light pruning on access
  const TTL_MS = 30 * 60 * 1000;
  for (const [k, v] of confusionScoreHistoryByUser.entries()) {
    if (!v || typeof v.lastUpdatedMs !== 'number') {
      confusionScoreHistoryByUser.delete(k);
      continue;
    }
    if (now - v.lastUpdatedMs > TTL_MS) confusionScoreHistoryByUser.delete(k);
  }

  const existing = confusionScoreHistoryByUser.get(userId);
  const scores = Array.isArray(existing?.scores) ? existing.scores.slice(-SCORE_HISTORY_WINDOW) : [];
  scores.push(score);
  const trimmed = scores.slice(-SCORE_HISTORY_WINDOW);
  confusionScoreHistoryByUser.set(userId, { scores: trimmed, lastUpdatedMs: now });
  return trimmed;
}

async function postConfusion(req, res) {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ message: 'MongoDB not connected; cannot persist confusion events yet' });
    }

    const userId = String(req.body.userId || '').trim();
    if (!userId) return res.status(400).json({ message: 'userId is required' });

    const topic = isNonEmptyString(req.body.topic) ? String(req.body.topic).trim() : 'General';
    const behavior_vector = req.body.behavior_vector;
    if (!Array.isArray(behavior_vector) || behavior_vector.length !== 5) {
      return res.status(400).json({ message: 'behavior_vector must be an array of 5 numbers' });
    }

    const nums = behavior_vector.map((x) => (typeof x === 'number' ? x : Number(x)));
    if (nums.some((n) => !Number.isFinite(n))) {
      return res.status(400).json({ message: 'behavior_vector must contain only finite numbers' });
    }

    const prediction = req.body.prediction;

    let timestamp = null;
    if (req.body.timestamp) {
      timestamp = parseUnixSecondsToDate(req.body.timestamp);
      if (!timestamp || Number.isNaN(timestamp.getTime())) {
        return res.status(400).json({ message: 'timestamp must be a unix time (seconds)' });
      }
    }

    const created = await ConfusionEvent.create({
      userId,
      topic,
      behavior_vector: nums,
      prediction,
      timestamp: timestamp || new Date(),
    });

    // Explicit terminal log for debugging/ops visibility.
    // NOTE: This endpoint persists a client-reported confusion event.
    // The server-authoritative decision (score/threshold) is logged in `predictConfusion`.
    console.log(`[confusion_event] stored userId=${userId} topic=${topic} vector=${JSON.stringify(nums)}`);

    return res.status(201).json({ event: created });
  } catch (err) {
    console.error('[confusion] post error', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function predictConfusion(req, res) {
  try {
    const userId = String(req.body.userId || '').trim();
    if (!userId) return res.status(400).json({ message: 'userId is required' });

    const topic = isNonEmptyString(req.body.topic) ? String(req.body.topic).trim() : 'General';
    const behavior_vector = req.body.behavior_vector;
    if (!Array.isArray(behavior_vector) || behavior_vector.length !== 5) {
      return res.status(400).json({ message: 'Invalid behavior_vector (must be array of 5 numbers)' });
    }

    const nums = behavior_vector.map(coerceFiniteNumber);
    if (nums.some((n) => n === null)) {
      return res.status(400).json({ message: 'behavior_vector must contain only finite numbers' });
    }

    // SAFETY CHECK before ML call (prevents crashes)
    const features = nums;
    if (!Array.isArray(features) || features.length !== 5) {
      return res.status(400).json({ message: 'Invalid behavior_vector' });
    }

    // ML failure fallback (robust)
    let lr_prob = 0.5;
    let rf_prob = 0.5;

    try {
      const ml = await postMlPredict(features);
      const lr = coerceFiniteNumber(ml.lr_prob);
      const rf = coerceFiniteNumber(ml.rf_prob);
      if (lr !== null) lr_prob = clamp01(lr);
      if (rf !== null) rf_prob = clamp01(rf);
    } catch (err) {
      console.error('[confusion_predict] ML error, using fallback', err && err.message ? err.message : err);
    }

    const { lrW, rfW } = normalizeWeights(LR_WEIGHT, RF_WEIGHT);
    // Weighted ensemble (better): RF gets higher weight by default.
    const raw_final_score = clamp01(lrW * lr_prob + rfW * rf_prob);
    const history = pushScoreForUser(userId, raw_final_score);
    const avgScore = clamp01(mean(history));
    const confusion = avgScore > CONFUSION_THRESHOLD;
    const band = confidenceBand(avgScore);

    // Always write CSV with label 0/1
    const label = confusion ? 1 : 0;
    const timestampMs = Date.now();
    await appendCsvRow({ userId, vector: nums, label, timestampMs });

    // Log to terminal with explicit confusion visibility (always synced with decision)
    console.log('confusion:', confusion ? 'yes' : 'no');
    console.log(
      `[confusion_predict] userId=${userId} topic=${topic} lr_prob=${lr_prob.toFixed(3)} rf_prob=${rf_prob.toFixed(
        3
      )} weights=${lrW.toFixed(2)}/${rfW.toFixed(2)} raw_score=${raw_final_score.toFixed(3)} score=${avgScore.toFixed(
        3
      )} band=${band} label=${label} vector=${JSON.stringify(
        nums
      )}`
    );

    // Save to MongoDB only when confusion=true
    if (confusion) {
      if (mongoose.connection.readyState !== 1) {
        console.warn('[confusion_predict] MongoDB not connected; skipping ConfusionEvent persistence');
      } else {
      let timestamp = null;
      if (req.body.timestamp) {
        timestamp = parseUnixSecondsToDate(req.body.timestamp);
        if (!timestamp || Number.isNaN(timestamp.getTime())) {
          return res.status(400).json({ message: 'timestamp must be a unix time (seconds)' });
        }
      }

      await ConfusionEvent.create({
        userId,
        topic,
        behavior_vector: nums,
        prediction: {
          lr_prob,
          rf_prob,
          raw_final_score,
          final_score: avgScore,
          confidence_band: band,
          threshold: CONFUSION_THRESHOLD,
          weights: { lr: lrW, rf: rfW },
          window: SCORE_HISTORY_WINDOW,
        },
        timestamp: timestamp || new Date(),
      });
      }
    }

    return res.json({
      confusion,
      score: avgScore,
      band,
      lr_prob,
      rf_prob,
    });
  } catch (err) {
    console.error('[confusion_predict] error', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

module.exports = { postConfusion, predictConfusion };
