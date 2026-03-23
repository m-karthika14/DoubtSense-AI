const express = require('express');
const { setAgentStatus, getAgentStatus } = require('../controllers/agentController');
const { requireUserId } = require('../middlewares/requireUserId');

const router = express.Router();

// GET /api/agent/status?userId=...
router.get('/agent/status', getAgentStatus);

// POST /api/agent/status { userId, agentActive }
router.post('/agent/status', requireUserId, setAgentStatus);

module.exports = router;
