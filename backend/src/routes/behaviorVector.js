const express = require('express');
const { logBehaviorVector } = require('../controllers/behaviorVectorController');
const { requireUserId } = require('../middlewares/requireUserId');
const { requireAgentActive } = require('../middlewares/requireAgentActive');

const router = express.Router();

// POST /api/behavior-vector/log
// Log-only endpoint for debugging; no DB writes.
router.post('/behavior-vector/log', requireAgentActive, requireUserId, logBehaviorVector);

module.exports = router;
