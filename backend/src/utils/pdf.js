const pdfParse = require('pdf-parse');

async function extractTextFromPdfBuffer(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error('PDF buffer is required');
  }

  const data = await pdfParse(buffer);
  return String(data && data.text ? data.text : '');
}

module.exports = { extractTextFromPdfBuffer };
