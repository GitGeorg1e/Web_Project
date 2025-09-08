const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'topic_pdfs');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^\w.\-]+/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  }
});

function fileFilter(req, file, cb) {
  if (file.mimetype !== 'application/pdf') {
    return cb(new Error('Μόνο PDF επιτρέπεται'), false);
  }
  cb(null, true);
}

const uploadTopicPdf = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

module.exports = { uploadTopicPdf, uploadDir };
