const express = require('express');
const crypto = require('crypto');

const { requireUserId } = require('../middlewares/requireUserId');
const { requireAgentActive } = require('../middlewares/requireAgentActive');
const { getOpenAIClient, getOpenAIModelName, getResponseText } = require('../utils/openaiClient');

const router = express.Router();

const OPENAI_TOPIC_TIMEOUT_MS = Number(process.env.OPENAI_TOPIC_TIMEOUT_MS || 6000);
const MAX_TEXT_CHARS = Number(process.env.TOPIC_DETECT_MAX_CHARS || 1800);

const cache = new Map();
const MAX_CACHE_ITEMS = 500;

function withTimeout(promise, ms, label) {
  const timeoutMs = Number.isFinite(ms) && ms > 0 ? ms : 6000;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => {
        const err = new Error(`${label || 'operation'} timed out after ${timeoutMs}ms`);
        err.code = 'TIMEOUT';
        reject(err);
      }, timeoutMs);
    }),
  ]);
}

function stableHash(text) {
  return crypto.createHash('sha1').update(text).digest('hex');
}

function safeParseJson(text) {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    // Try to salvage a JSON object substring
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

router.post('/topic/detect', requireAgentActive, requireUserId, async (req, res) => {
  try {
    const textRaw = typeof req.body.text === 'string' ? req.body.text : '';
    const text = textRaw.trim();
    if (!text) return res.status(400).json({ message: 'text is required' });

    const clipped = text.length > MAX_TEXT_CHARS ? text.slice(0, MAX_TEXT_CHARS) : text;
    const key = stableHash(clipped);

    if (cache.has(key)) {
      return res.json({ topic: cache.get(key) });
    }

    const prompt = `You are a classifier.

Given the following study material excerpt, return ONE concise topic label.

Requirements:
- Return ONLY JSON: {"topic":"..."}
- topic must be 2 to 6 words
- Use Title Case (e.g., "Linear Algebra", "Newton's Laws")
- Do NOT include punctuation like ":" or trailing periods

Excerpt:\n"""\n${clipped}\n"""`;

    const client = getOpenAIClient();
    const model = getOpenAIModelName();

    const response = await withTimeout(
      client.responses.create({
        model,
        input: prompt,
        text: {
          format: {
            type: 'json_schema',
            name: 'topic_label',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                topic: { type: 'string' },
              },
              required: ['topic'],
            },
          },
        },
        max_output_tokens: 60,
      }),
      OPENAI_TOPIC_TIMEOUT_MS,
      'openai.responses.create'
    );

    const out = getResponseText(response);
    const parsed = safeParseJson(out);
    const topic = parsed && typeof parsed.topic === 'string' ? parsed.topic.trim() : '';

    if (!topic) {
      return res.status(502).json({ message: 'Failed to detect topic' });
    }

    // basic cache bounds
    if (cache.size >= MAX_CACHE_ITEMS) {
      const firstKey = cache.keys().next().value;
      if (firstKey) cache.delete(firstKey);
    }
    cache.set(key, topic);

    return res.json({ topic });
  } catch (err) {
    if (err && err.code === 'TIMEOUT') {
      return res.status(504).json({ message: 'Topic detection timed out' });
    }
    console.error('[topic/detect] error', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
