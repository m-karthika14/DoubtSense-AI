const express = require('express');
const WebContextEvent = require('../models/WebContextEvent');

const router = express.Router();

function parseLimit(v, fallback) {
  const n = Number.parseInt(String(v || ''), 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, 200);
}

// GET /api/web-context/latest?userId=...
router.get('/web-context/latest', async (req, res) => {
  try {
    const userId = typeof req.query.userId === 'string' ? req.query.userId.trim() : '';
    if (!userId) return res.status(400).json({ message: 'userId is required' });

    const event = await WebContextEvent.findOne({ userId }).sort({ createdAt: -1 }).lean();
    return res.json({ event });
  } catch (err) {
    console.error('[web-context/latest] error', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/web-context?userId=...&limit=...
router.get('/web-context', async (req, res) => {
  try {
    const userId = typeof req.query.userId === 'string' ? req.query.userId.trim() : '';
    if (!userId) return res.status(400).json({ message: 'userId is required' });

    const limit = parseLimit(req.query.limit, 50);
    const events = await WebContextEvent.find({ userId }).sort({ createdAt: -1 }).limit(limit).lean();
    return res.json({ events });
  } catch (err) {
    console.error('[web-context] error', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
