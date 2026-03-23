const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { uploadPdf } = require('../controllers/uploadController');
const { requireAgentActive } = require('../middlewares/requireAgentActive');

const router = express.Router();

const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const now = Date.now();
    const random = Math.random().toString(16).slice(2);
    const original = String(file.originalname || 'upload').replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${now}-${random}-${original}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
  },
});

// POST /api/upload
router.post('/upload', upload.single('file'), requireAgentActive, uploadPdf);

module.exports = router;
