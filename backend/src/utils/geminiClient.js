const { GoogleGenerativeAI } = require('@google/generative-ai');

function normalizeModelName(rawModelName) {
  if (typeof rawModelName !== 'string') return '';
  const trimmed = rawModelName.trim();
  if (!trimmed) return '';
  return trimmed.startsWith('models/') ? trimmed.slice('models/'.length) : trimmed;
}

function toPositiveInt(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const i = Math.floor(n);
  return i > 0 ? i : null;
}

function getGeminiModel() {
  const apiKey = typeof process.env.GEMINI_API_KEY === 'string' ? process.env.GEMINI_API_KEY.trim() : '';
  if (!apiKey) {
    const err = new Error('GEMINI_API_KEY is not set');
    err.code = 'GEMINI_MISSING_KEY';
    throw err;
  }

  const modelName = normalizeModelName(process.env.GEMINI_MODEL) || 'gemini-flash-latest';
  const maxOutputTokens = toPositiveInt(process.env.GEMINI_MAX_OUTPUT_TOKENS) || 200;

  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      maxOutputTokens,
    },
  });
}

module.exports = { getGeminiModel };
