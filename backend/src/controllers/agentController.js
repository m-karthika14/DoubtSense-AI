const AgentState = require('../models/AgentState');

async function setAgentStatus(req, res) {
  try {
    const userId = String(req.body.userId || '').trim();
    if (!userId) return res.status(400).json({ message: 'userId is required' });

    const agentActiveRaw = req.body.agentActive;
    const agentActive = agentActiveRaw === true || String(agentActiveRaw).toLowerCase() === 'true';

    const now = new Date();

    const state = await AgentState.findOneAndUpdate(
      { userId },
      { userId, agentActive, lastUpdated: now },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.json({ state });
  } catch (err) {
    console.error('[agent] set error', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function getAgentStatus(req, res) {
  try {
    const userId = String(req.query.userId || '').trim();
    if (!userId) return res.status(400).json({ message: 'userId is required' });

    const state = await AgentState.findOne({ userId });

    // If no record exists yet, default to OFF (fail-safe).
    if (!state) {
      return res.json({ state: { userId, agentActive: false, lastUpdated: null } });
    }

    return res.json({ state });
  } catch (err) {
    console.error('[agent] get error', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

module.exports = { setAgentStatus, getAgentStatus };
