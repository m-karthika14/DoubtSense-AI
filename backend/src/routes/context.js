const express = require('express');
const { postContext, getContext } = require('../controllers/contextController');
const { requireUserId } = require('../middlewares/requireUserId');
const { requireAgentActive } = require('../middlewares/requireAgentActive');

const router = express.Router();

// GET /api/context?userId=...
router.get('/context', getContext);

// POST /api/context
router.post('/context', requireAgentActive, requireUserId, postContext);

module.exports = router;
