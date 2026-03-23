const Content = require('../models/Content');

async function getContentById(req, res) {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ message: 'contentId is required' });

    const doc = await Content.findById(id).lean();
    if (!doc) return res.status(404).json({ message: 'Content not found' });

    return res.json({ content: doc });
  } catch (err) {
    console.error('[content] get error', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

module.exports = { getContentById };
