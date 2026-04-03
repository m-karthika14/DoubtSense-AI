const express = require('express');
const mongoose = require('mongoose');

const Context = require('../models/Context');
const { requireUserId } = require('../middlewares/requireUserId');
const { getOpenAIClient, getOpenAIModelName, getResponseText } = require('../utils/openaiClient');

const router = express.Router();

// METHOD 1 — CACHE
// Cache explanations by topic to avoid repeated LLM calls.
// Note: in-memory cache resets when the backend restarts.
const explanationCache = new Map();

// METHOD 2 — COOLDOWN
// Prevent LLM spam; if within cooldown window, return cached or fallback.
const lastExplainCallByUser = new Map();
const EXPLAIN_COOLDOWN_MS = 30_000;

function isRateLimitError(err) {
  return Boolean(err && (err.status === 429 || err.statusCode === 429));
}

function isMissingOpenAIKeyError(err) {
  return Boolean(err && (err.code === 'OPENAI_MISSING_KEY' || /OPENAI_API_KEY is not set/i.test(String(err.message || ''))));
}

function buildFallbackLevels(topic, paragraph) {
  const base = (typeof paragraph === 'string' ? paragraph.trim() : '');
  const short = base.length > 0 ? base : `You're looking at: ${topic}.`;
  const clipped = short.length > 400 ? `${short.slice(0, 397)}...` : short;

  return {
    level1: `${topic}: ${clipped}`,
    level2: `Real-world example: Think of a situation where "${topic}" shows up in something you do (work, school, or daily life).\nEveryday analogy: Imagine explaining "${topic}" using a simple object you can picture—like a recipe or a map.\n${clipped}`,
    level3: `"${topic}" means this: ${clipped}\nIt’s like learning a new game—first you learn the rules, then you practice with easy examples.`,
  };
}

function extractJsonObjectSubstring(text) {
  if (typeof text !== 'string') return null;

  // Strip common Markdown code fences
  const withoutFences = text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  const start = withoutFences.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  for (let i = start; i < withoutFences.length; i += 1) {
    const ch = withoutFences[i];
    if (ch === '{') depth += 1;
    if (ch === '}') depth -= 1;
    if (depth === 0) {
      return withoutFences.slice(start, i + 1);
    }
  }

  return null;
}

function safeParseLevels(text) {
  const jsonSubstring = extractJsonObjectSubstring(text);
  if (!jsonSubstring) return null;

  try {
    const data = JSON.parse(jsonSubstring);
    if (!data || typeof data !== 'object') return null;

    const level1 = typeof data.level1 === 'string' ? data.level1 : null;
    const level2 = typeof data.level2 === 'string' ? data.level2 : null;
    const level3 = typeof data.level3 === 'string' ? data.level3 : null;

    if (!level1 || !level2 || !level3) return null;
    return { level1, level2, level3 };
  } catch {
    return null;
  }
}

router.post('/explain', requireUserId, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: 'MongoDB not connected' });
    }

    const userId = String(req.body.userId || '').trim();

    // MANDATORY: fetch latest context from MongoDB
    const context = await Context.findOne({ userId }).sort({ createdAt: -1 });

    // MANDATORY: extract topic + paragraph
    const topic =
      (context && Array.isArray(context.headings) && context.headings[0]) ||
      (context && context.title) ||
      'General';

    const paragraph = (context && typeof context.paragraph === 'string' ? context.paragraph : '') || '';

    // Cache check (biggest impact)
    if (explanationCache.has(topic)) {
      console.log('[explain] CACHE HIT topic=%s', topic);
      return res.json({ topic, ...explanationCache.get(topic) });
    }

    // Cooldown check (anti-spam)
    const nowMs = Date.now();
    const lastMs = lastExplainCallByUser.get(userId) || 0;
    if (nowMs - lastMs < EXPLAIN_COOLDOWN_MS) {
      console.log('[explain] COOLDOWN ACTIVE userId=%s topic=%s', userId, topic);
      const fallback = buildFallbackLevels(topic, paragraph);
      return res.json({ topic, ...fallback });
    }

    lastExplainCallByUser.set(userId, nowMs);

    const prompt = `You are a friendly AI tutor.

Explain the concept: "${topic}"

Context:
"${paragraph}"

Generate 3 levels:

LEVEL 1:
- Clear explanation using proper technical terms
- Short (3–4 lines)

LEVEL 2:
- Explain using:
  1. Real-world example
  2. Simple everyday analogy

LEVEL 3:
- Explain like to a 7-year-old
- Very simple words
- Use relatable objects

Return ONLY JSON:

{
  "level1": "...",
  "level2": "...",
  "level3": "..."
}

Rules:
- level1, level2, level3 must be plain strings (NOT objects/arrays)
- Keep each level short (max ~50 words)
- Do not add any extra keys`;

    console.log('[explain] CALLING OPENAI topic=%s', topic);

    let text = '';
    try {
      const client = getOpenAIClient();
      const model = getOpenAIModelName();
      const response = await client.responses.create({
        model,
        input: prompt,
        text: {
          format: {
            type: 'json_schema',
            name: 'explanation_levels',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                level1: { type: 'string' },
                level2: { type: 'string' },
                level3: { type: 'string' },
              },
              required: ['level1', 'level2', 'level3'],
            },
          },
        },
        max_output_tokens: 200,
      });
      text = getResponseText(response);
    } catch (err) {
      if (isRateLimitError(err)) {
        const fallback = buildFallbackLevels(topic, paragraph);
        return res.json({ topic, ...fallback });
      }
      if (isMissingOpenAIKeyError(err)) {
        const fallback = buildFallbackLevels(topic, paragraph);
        return res.json({ topic, ...fallback });
      }
      throw err;
    }

    const parsed = safeParseLevels(text);
    if (parsed) {
      // Store in cache for future calls.
      explanationCache.set(topic, parsed);
      return res.json({ topic, ...parsed });
    }

    // Fallback: keep response JSON-shape-safe even if the model violates instructions.
    const fallbackText = typeof text === 'string' && text.trim().length > 0
      ? text.trim()
      : 'Sorry — I could not generate an explanation right now.';

    return res.json({
      topic,
      level1: fallbackText,
      level2: fallbackText,
      level3: fallbackText,
    });
  } catch (err) {
    console.error('[explain] error', err);
    return res.status(500).json({ error: 'LLM failed' });
  }
});

router.post('/ask-doubt', requireUserId, async (req, res) => {
  try {
    const topic = typeof req.body.topic === 'string' ? req.body.topic.trim() : 'General';
    const question = typeof req.body.question === 'string' ? req.body.question.trim() : '';

    if (!question) {
      return res.status(400).json({ error: 'question is required' });
    }

    const trimmedQuestion = question.slice(0, 2000);

    const prompt = `You are a helpful tutor.

Student is studying: "${topic}"

Student question:
"${trimmedQuestion}"

Answer clearly:
  - Use simple words
  - Prefer 3–5 bullet points
  - Max 120 words
  - No markdown headings`;

    let text = '';
    try {
      const client = getOpenAIClient();
      const model = getOpenAIModelName();
      const response = await client.responses.create({
        model,
        input: prompt,
        max_output_tokens: 200,
      });
      text = getResponseText(response);
    } catch (err) {
      if (isRateLimitError(err)) {
        const answer = `I can’t reach the tutor model right now (quota/rate limit).\n\nTry this:\n1) Tell me what part is confusing (a word, step, or formula).\n2) Share the exact line you’re stuck on.\n3) I’ll walk through a small example step-by-step.`;
        return res.json({ answer });
      }
      if (isMissingOpenAIKeyError(err)) {
        const answer = `Tutor is not configured yet (OPENAI_API_KEY is missing on the backend).\n\nAsk your admin to set OPENAI_API_KEY in backend/.env, then retry.`;
        return res.json({ answer });
      }
      throw err;
    }

    const answer = typeof text === 'string' && text.trim().length > 0
      ? text.trim()
      : 'Sorry — I could not answer that right now.';

    return res.json({ answer });
  } catch (err) {
    console.error('[ask-doubt] error', err);
    return res.status(500).json({ error: 'LLM failed' });
  }
});

module.exports = router;
