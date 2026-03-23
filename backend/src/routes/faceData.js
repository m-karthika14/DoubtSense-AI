const express = require('express');
const { postFaceData, getLatestFaceData } = require('../controllers/faceDataController');

const router = express.Router();

// POST /api/face-data
router.post('/face-data', postFaceData);

// GET /api/face-data/latest?student_id=...&limit=20
router.get('/face-data/latest', getLatestFaceData);

module.exports = router;
