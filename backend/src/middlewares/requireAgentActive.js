function isAgentActiveValue(v) {
  if (v === true) return true;
  if (typeof v === 'string') return v.toLowerCase() === 'true';
  return false;
}

function requireAgentActive(req, res, next) {
  const agentActive = req.body && req.body.agentActive;
  if (!isAgentActiveValue(agentActive)) {
    return res.status(403).json({ message: 'Agent is OFF' });
  }
  return next();
}

module.exports = { requireAgentActive };
