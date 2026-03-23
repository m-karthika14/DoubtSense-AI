const FaceEvent = require('../models/FaceEvent');

function normalizeString(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function parseBooleanStrict(value) {
  if (value === true) return true;
  if (value === false) return false;
  return null;
}

function parseNumber(value) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

async function postFaceData(req, res) {
  try {
    const student_id = normalizeString(req.body?.student_id);
    if (!student_id) return res.status(400).json({ message: 'student_id is required' });

    const present = parseBooleanStrict(req.body?.present);
    if (present === null) return res.status(400).json({ message: 'present must be a boolean' });

    const attention_score = parseNumber(req.body?.attention_score);
    if (attention_score === null || (attention_score !== 0 && attention_score !== 1)) {
      return res.status(400).json({ message: 'attention_score must be 0 or 1' });
    }

    const emotion = normalizeString(req.body?.emotion);
    if (!emotion) return res.status(400).json({ message: 'emotion is required' });
    if (emotion.length > 64) return res.status(400).json({ message: 'emotion is too long' });

    const emotion_score = parseNumber(req.body?.emotion_score);
    if (emotion_score === null || emotion_score < 0 || emotion_score > 1) {
      return res.status(400).json({ message: 'emotion_score must be a number between 0 and 1' });
    }

    const timestampRaw = req.body?.timestamp;
    const timestamp = timestampRaw ? new Date(timestampRaw) : new Date();
    if (!(timestamp instanceof Date) || Number.isNaN(timestamp.getTime())) {
      return res.status(400).json({ message: 'timestamp must be a valid date' });
    }

    const created = await FaceEvent.create({
      student_id,
      timestamp,
      face_data: {
        present,
        attention_score,
        emotion,
        emotion_score,
      },
    });

    return res.status(201).json({ event: created });
  } catch (err) {
    console.error('[face-data] post error', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function getLatestFaceData(req, res) {
  try {
    const student_id = normalizeString(req.query?.student_id);
    if (!student_id) return res.status(400).json({ message: 'student_id is required' });

    const limitRaw = req.query?.limit;
    const limitNum = limitRaw ? Number(limitRaw) : 20;
    const limit = Number.isFinite(limitNum) ? Math.min(Math.max(1, Math.floor(limitNum)), 200) : 20;

    const events = await FaceEvent.find({ student_id })
      .sort({ timestamp: -1 })
      .limit(limit);

    return res.json({ events });
  } catch (err) {
    console.error('[face-data] get error', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

module.exports = { postFaceData, getLatestFaceData };
