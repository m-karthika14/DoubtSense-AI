const express = require('express');
const mongoose = require('mongoose');

const Feedback = require('../models/Feedback');
const { requireUserId } = require('../middlewares/requireUserId');

const router = express.Router();

router.post('/feedback', requireUserId, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: 'MongoDB not connected' });
    }

    const userId = String(req.body.userId || '').trim();
    const topic = typeof req.body.topic === 'string' && req.body.topic.trim().length > 0
      ? req.body.topic.trim()
      : 'General';

    const levelSeen = Number(req.body.levelSeen);
    const understood = Boolean(req.body.understood === true);

    if (![1, 2, 3].includes(levelSeen)) {
      return res.status(400).json({ error: 'levelSeen must be 1, 2, or 3' });
    }

    await Feedback.create({
      userId,
      topic,
      levelSeen,
      understood,
      timestamp: new Date(),
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error('[feedback] error', err);
    return res.status(500).json({ error: 'Failed to store feedback' });
  }
});

module.exports = router;
