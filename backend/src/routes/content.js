const express = require('express');
const { getContentById } = require('../controllers/contentController');

const router = express.Router();

// GET /api/content/:id
router.get('/content/:id', getContentById);

module.exports = router;
