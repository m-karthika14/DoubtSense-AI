function requireUserId(req, res, next) {
  const userId = req.body && req.body.userId;
  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    return res.status(400).json({ message: 'userId is required' });
  }
  return next();
}

module.exports = { requireUserId };
