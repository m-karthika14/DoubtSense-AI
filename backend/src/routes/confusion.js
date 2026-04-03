const express = require('express');
const { postConfusion, predictConfusion } = require('../controllers/confusionController');
const { requireUserId } = require('../middlewares/requireUserId');
const { requireAgentActive } = require('../middlewares/requireAgentActive');

const router = express.Router();

// POST /api/confusion
router.post('/confusion', requireAgentActive, requireUserId, postConfusion);

// POST /api/confusion/predict
// Server-authoritative confusion detection:
// - Calls FastAPI ML for probabilities (LR + RF)
// - Combines + smooths last-3 scores
// - Logs ALL vectors to CSV with label 0/1
// - Stores to MongoDB only when confusion=true
router.post('/confusion/predict', requireAgentActive, requireUserId, predictConfusion);

module.exports = router;
