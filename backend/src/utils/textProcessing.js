function cleanText(raw) {
  const text = String(raw || '');

  // Normalize line endings and collapse whitespace.
  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ') // collapse spaces/tabs
    .replace(/\n{3,}/g, '\n\n'); // collapse very large gaps

  return normalized.trim();
}

function splitIntoSections(cleanedText) {
  const text = cleanText(cleanedText);
  if (!text) return [];

  // Paragraph-ish splitting by blank lines.
  const parts = text
    .split(/\n\s*\n/g)
    .map((p) => p.trim())
    .filter(Boolean);

  // Drop extremely small fragments (often headers/footers from PDFs)
  return parts.filter((p) => p.length >= 20);
}

module.exports = { cleanText, splitIntoSections };
