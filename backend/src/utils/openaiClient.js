const OpenAI = require('openai');

let cachedClient = null;

function getOpenAIClient() {
  const apiKey = typeof process.env.OPENAI_API_KEY === 'string' ? process.env.OPENAI_API_KEY.trim() : '';
  if (!apiKey) {
    const err = new Error('OPENAI_API_KEY is not set');
    err.code = 'OPENAI_MISSING_KEY';
    throw err;
  }

  if (!cachedClient) {
    cachedClient = new OpenAI({ apiKey });
  }

  return cachedClient;
}

function getOpenAIModelName() {
  const model = typeof process.env.OPENAI_MODEL === 'string' ? process.env.OPENAI_MODEL.trim() : '';
  return model || 'gpt-4o-mini';
}

function getResponseText(response) {
  // The official OpenAI Node SDK exposes `output_text` for Responses API.
  if (response && typeof response.output_text === 'string') {
    return response.output_text;
  }

  // Fallbacks for older/alternate shapes.
  if (response && Array.isArray(response.output) && response.output.length > 0) {
    const first = response.output[0];
    if (first && Array.isArray(first.content)) {
      const parts = first.content
        .map((p) => (p && typeof p.text === 'string' ? p.text : ''))
        .filter(Boolean);
      if (parts.length > 0) return parts.join('\n');
    }
  }

  return '';
}

module.exports = {
  getOpenAIClient,
  getOpenAIModelName,
  getResponseText,
};
