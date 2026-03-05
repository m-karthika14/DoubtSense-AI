const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

function createToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ message: 'User already exists' });

    // Check for duplicate name (case-insensitive)
    if (name) {
      const nameExists = await User.findOne({ name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' } });
      if (nameExists) return res.status(409).json({ message: 'Name not available' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = new User({
      userId: uuidv4(),
      name: name || null,
      email: email.toLowerCase(),
      password: hashed,
      isGuest: false
    });
    await user.save();
  const token = createToken({ id: user._id.toString(), userId: user.userId, email: user.email });
    const safeUser = { id: user._id, userId: user.userId, name: user.name, email: user.email, isGuest: user.isGuest };
  console.log(`[auth] [${new Date().toISOString()}] New user registered: userId=${user.userId} email=${user.email} ip=${req.ip}`);
    return res.json({ token, user: safeUser });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// helper to escape regex special characters
function escapeRegex(str) {
  return (str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// check name availability
router.get('/check-name', async (req, res) => {
  try {
    const name = req.query.name;
    if (!name) return res.status(400).json({ message: 'Missing name' });
    const exists = await User.findOne({ name: { $regex: `^${escapeRegex(String(name))}$`, $options: 'i' } });
    return res.json({ available: !Boolean(exists) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      console.warn(`[auth] [${new Date().toISOString()}] Failed login attempt: no user for email=${email} ip=${req.ip}`);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const match = await bcrypt.compare(password, user.password || '');
    if (!match) {
      console.warn(`[auth] [${new Date().toISOString()}] Failed login attempt: invalid password for email=${email} userId=${user.userId} ip=${req.ip}`);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = createToken({ id: user._id.toString(), userId: user.userId, email: user.email });
    const safeUser = { id: user._id, userId: user.userId, name: user.name, email: user.email, isGuest: user.isGuest };
  console.log(`[auth] [${new Date().toISOString()}] User login: userId=${user.userId} email=${user.email} ip=${req.ip}`);
    return res.json({ token, user: safeUser });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// guest route
router.post('/guest', async (req, res) => {
  try {
    const guest = new User({ userId: 'guest-' + uuidv4(), isGuest: true });
  await guest.save();
  const token = createToken({ id: guest._id.toString(), userId: guest.userId });
  const safeUser = { id: guest._id, userId: guest.userId, isGuest: guest.isGuest };
  console.log(`[auth] [${new Date().toISOString()}] Guest created: userId=${guest.userId} id=${guest._id} ip=${req.ip}`);
  return res.json({ token, user: safeUser });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// auth middleware
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ message: 'Missing authorization header' });
  const parts = header.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ message: 'Invalid authorization format' });
  const token = parts[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    return next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    return res.json({ user });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
