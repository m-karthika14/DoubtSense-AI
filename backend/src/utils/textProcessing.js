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
  const paragraphs = text
    .split(/\n\s*\n/g)
    .map((p) => p.trim())
    .filter(Boolean);

  // Chunk paragraphs into larger sections so we:
  // - preserve the full document text
  // - avoid creating hundreds/thousands of tiny sections (which used to trigger truncation)
  const maxChars = Number(process.env.UPLOAD_SECTION_MAX_CHARS || 1400);
  const minChars = Number(process.env.UPLOAD_SECTION_MIN_CHARS || 40);

  const effectiveMax = Number.isFinite(maxChars) && maxChars > 200 ? maxChars : 1400;
  const effectiveMin = Number.isFinite(minChars) && minChars >= 0 ? minChars : 40;

  const sections = [];
  let current = '';

  const flush = () => {
    const s = current.trim();
    if (s && s.length >= effectiveMin) sections.push(s);
    else if (s) {
      // If it's below min length, still keep it by appending to the previous section.
      if (sections.length > 0) sections[sections.length - 1] = `${sections[sections.length - 1]}\n\n${s}`.trim();
      else sections.push(s);
    }
    current = '';
  };

  for (const para of paragraphs) {
    if (!current) {
      current = para;
      continue;
    }

    if ((current.length + 2 + para.length) <= effectiveMax) {
      current = `${current}\n\n${para}`;
    } else {
      flush();
      current = para;
    }
  }

  if (current) flush();
  return sections;
}

module.exports = { cleanText, splitIntoSections };
