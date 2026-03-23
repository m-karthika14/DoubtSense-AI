const mammoth = require('mammoth');
const officeParser = require('officeparser');
const { extractTextFromPdfBuffer } = require('./pdf');

const ALLOWED_EXTENSIONS = new Set(['pdf', 'docx', 'doc', 'pptx']);

function getExtension(originalName) {
  const name = String(originalName || '').trim();
  if (!name) return null;
  const lastDot = name.lastIndexOf('.');
  if (lastDot === -1) return null;
  return name.slice(lastDot + 1).toLowerCase();
}

function fileTypeFromExtension(ext) {
  if (!ext) return null;
  if (!ALLOWED_EXTENSIONS.has(ext)) return 'unsupported';
  return ext;
}

function fileTypeFromMime(mimetype) {
  const mime = String(mimetype || '').toLowerCase();
  if (!mime) return null;
  if (mime.includes('pdf')) return 'pdf';
  if (mime.includes('wordprocessingml') || mime.includes('msword')) return 'docx';
  if (mime.includes('presentationml') || mime.includes('powerpoint')) return 'pptx';
  return null;
}

function detectFileType({ originalName, mimetype } = {}) {
  const ext = getExtension(originalName);
  const extType = fileTypeFromExtension(ext);
  if (extType && extType !== 'unsupported') return extType;

  const mimeType = fileTypeFromMime(mimetype);
  if (mimeType) return mimeType;

  return null;
}

function collectNodes(nodes, predicate, out) {
  const list = Array.isArray(out) ? out : [];
  if (!Array.isArray(nodes)) return list;

  for (const node of nodes) {
    if (!node) continue;
    if (predicate(node)) list.push(node);
    if (Array.isArray(node.children) && node.children.length > 0) {
      collectNodes(node.children, predicate, list);
    }
  }

  return list;
}

async function extractTextFromDocxBuffer(buffer) {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return String(result && result.value ? result.value : '');
  } catch (e) {
    // Fallback for legacy .doc or cases where mammoth fails: use officeParser
    try {
      const ast = await officeParser.parseOffice(buffer, { ignoreNotes: true, newlineDelimiter: '\n' });
      const raw = typeof ast?.toText === 'function' ? ast.toText() : '';
      return String(raw || '');
    } catch (err) {
      return '';
    }
  }
}

async function extractTextFromDocBuffer(buffer) {
  try {
    const ast = await officeParser.parseOffice(buffer, { ignoreNotes: true, newlineDelimiter: '\n' });
    const raw = typeof ast?.toText === 'function' ? ast.toText() : '';
    return String(raw || '');
  } catch (err) {
    // As a last resort, try mammoth (sometimes works) and return empty string on failure
    try {
      const result = await mammoth.extractRawText({ buffer });
      return String(result && result.value ? result.value : '');
    } catch (e) {
      return '';
    }
  }
}

async function extractSlideSectionsFromPptxBuffer(buffer) {
  const ast = await officeParser.parseOffice(buffer, {
    ignoreNotes: true,
    newlineDelimiter: '\n',
  });

  const slides = collectNodes(ast && ast.content ? ast.content : [], (n) => n.type === 'slide', []);

  if (slides.length > 0) {
    return slides
      .map((s) => String(s && s.text ? s.text : '').trim())
      .filter(Boolean);
  }

  // Fallback: if slide nodes aren't present for some reason, use flattened text.
  const raw = typeof ast?.toText === 'function' ? ast.toText() : '';
  return String(raw)
    .split(/\n\s*\n/g)
    .map((t) => t.trim())
    .filter(Boolean);
}

async function extractFromUploadedFile(file) {
  if (!file || !Buffer.isBuffer(file.buffer)) {
    throw new Error('file buffer is required');
  }

  const ext = getExtension(file.originalname);
  const extType = fileTypeFromExtension(ext);
  if (extType === 'unsupported') {
    return {
      fileType: null,
      rawText: '',
      sections: [],
      validationError: 'Unsupported file type. Allowed: .pdf, .docx, .pptx',
    };
  }

  const mimeType = fileTypeFromMime(file.mimetype);
  if (extType && mimeType && extType !== mimeType) {
    return {
      fileType: null,
      rawText: '',
      sections: [],
      validationError: 'File extension does not match detected file type',
    };
  }

  const fileType = extType || mimeType;
  if (!fileType) {
    return { fileType: null, rawText: '', sections: [], validationError: 'Unsupported file type. Allowed: .pdf, .docx, .pptx' };
  }

  if (fileType === 'pdf') {
    const rawText = await extractTextFromPdfBuffer(file.buffer);
    return { fileType, rawText, sections: null };
  }

  if (fileType === 'docx' || fileType === 'doc') {
    const rawText = fileType === 'docx'
      ? await extractTextFromDocxBuffer(file.buffer)
      : await extractTextFromDocBuffer(file.buffer);
    return { fileType: fileType === 'doc' ? 'docx' : fileType, rawText, sections: null };
  }

  if (fileType === 'pptx') {
    const sections = await extractSlideSectionsFromPptxBuffer(file.buffer);
    return { fileType, rawText: null, sections };
  }

  return { fileType: null, rawText: '', sections: [], validationError: 'Unsupported file type. Allowed: .pdf, .docx, .pptx' };
}

module.exports = {
  detectFileType,
  extractFromUploadedFile,
};
