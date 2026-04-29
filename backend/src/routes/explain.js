const express = require('express');
const mongoose = require('mongoose');

const Context = require('../models/Context');
const WebContextEvent = require('../models/WebContextEvent');
const Content = require('../models/Content');
const { requireUserId } = require('../middlewares/requireUserId');
const { getOpenAIClient, getOpenAIModelName, getResponseText } = require('../utils/openaiClient');

const router = express.Router();

// METHOD 1 — CACHE
// Cache explanations by topic to avoid repeated LLM calls.
// Note: in-memory cache resets when the backend restarts.
const explanationCache = new Map();

// Keep the endpoint responsive even if the LLM/network is slow.
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_EXPLAIN_TIMEOUT_MS || 25000);
const CONTEXT_PARAGRAPH_MAX_CHARS = Number(process.env.EXPLAIN_CONTEXT_MAX_CHARS || 1200);
const DOUBT_CONTEXT_MAX_CHARS = Number(process.env.ASK_DOUBT_CONTEXT_MAX_CHARS || 1400);

const EXPLAIN_MAX_OUTPUT_TOKENS = Number(process.env.EXPLAIN_MAX_OUTPUT_TOKENS || 350);

const INSUFFICIENT_EXCERPT_MIN_CHARS = Number(process.env.INSUFFICIENT_EXCERPT_MIN_CHARS || 80);

const NOT_ENOUGH_CONTEXT_EXPLAIN_MESSAGE =
  'Not enough context from your material/web page to explain this accurately. Please open the relevant section or upload/paste the exact paragraph you want explained.';

const NOT_ENOUGH_CONTEXT_DOUBT_MESSAGE =
  'I don\'t have enough context from your material/web page to answer this accurately. Please share the exact paragraph/page (or open the relevant section) and tell me which step/line is confusing.';

function withTimeout(promise, ms, label) {
  const timeoutMs = Number.isFinite(ms) && ms > 0 ? ms : 8000;
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

function isRateLimitError(err) {
  return Boolean(err && (err.status === 429 || err.statusCode === 429));
}

function isMissingOpenAIKeyError(err) {
  return Boolean(err && (err.code === 'OPENAI_MISSING_KEY' || /OPENAI_API_KEY is not set/i.test(String(err.message || ''))));
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

function clampText(text, maxChars) {
  const s = typeof text === 'string' ? text : String(text || '');
  if (!Number.isFinite(maxChars) || maxChars <= 0) return s;
  if (s.length <= maxChars) return s;
  return `${s.slice(0, maxChars)}...`;
}

function stripWebMetadataLines(text) {
  if (typeof text !== 'string') return '';
  return text
    .split('\n')
    .filter((line) => {
      const t = String(line || '').trim();
      if (!t) return false;
      return !/^Title:\s*/i.test(t) && !/^URL:\s*/i.test(t) && !/^Headings:\s*/i.test(t);
    })
    .join('\n')
    .trim();
}

function isInsufficientExcerpt(text, { source } = {}) {
  const trimmed = typeof text === 'string' ? text.trim() : String(text || '').trim();
  if (!trimmed) return true;

  const minChars = Number.isFinite(INSUFFICIENT_EXCERPT_MIN_CHARS) && INSUFFICIENT_EXCERPT_MIN_CHARS > 0
    ? INSUFFICIENT_EXCERPT_MIN_CHARS
    : 80;

  if (trimmed.length >= minChars) return false;

  // For web excerpts we often have Title/URL/Headings without actual body text.
  if (source === 'web') {
    const bodyOnly = stripWebMetadataLines(trimmed);
    return bodyOnly.length < minChars;
  }

  return true;
}

function uniqueBySectionId(sections) {
  const out = [];
  const seen = new Set();
  for (const s of sections) {
    const id = s && typeof s.sectionId === 'string' ? s.sectionId : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(s);
  }
  return out;
}

function pickNeighborSectionIds(sectionId) {
  const m = typeof sectionId === 'string' ? sectionId.match(/^s(\d+)$/i) : null;
  if (!m) return [sectionId];
  const n = Number.parseInt(m[1], 10);
  if (!Number.isFinite(n) || n <= 0) return [sectionId];
  const ids = [];
  if (n - 1 >= 1) ids.push(`s${n - 1}`);
  ids.push(`s${n}`);
  ids.push(`s${n + 1}`);
  return ids;
}

async function buildStudyExcerpt({ studyContext, topic, maxChars }) {
  if (!studyContext) return '';

  const sectionId = typeof studyContext.sectionId === 'string' ? studyContext.sectionId.trim() : '';

  // PDF page-specific help: when the client posts sectionId like "p5" and a paragraph,
  // prefer that paragraph over upload-time contentMap sections (s1/s2/...).
  if (/^p\d+$/i.test(sectionId)) {
    const raw = (typeof studyContext.paragraph === 'string' ? studyContext.paragraph : '') || '';
    if (raw) return clampText(raw, maxChars);
  }

  // Prefer content-backed excerpts for uploaded/internal study sessions.
  const contentId = studyContext.contentId ? String(studyContext.contentId) : '';
  if (!contentId) {
    const raw = (typeof studyContext.paragraph === 'string' ? studyContext.paragraph : '') || '';
    return clampText(raw, maxChars);
  }

  const content = await Content.findById(contentId).lean();
  const map = content && Array.isArray(content.contentMap) ? content.contentMap : [];
  if (map.length === 0) {
    const raw = (typeof studyContext.paragraph === 'string' ? studyContext.paragraph : '') || '';
    return clampText(raw, maxChars);
  }

  let selected = [];

  if (sectionId) {
    const desiredIds = pickNeighborSectionIds(sectionId);
    selected = map.filter((s) => s && typeof s.sectionId === 'string' && desiredIds.includes(s.sectionId));
  }

  if (selected.length === 0 && topic) {
    selected = map.filter((s) => s && typeof s.topic === 'string' && s.topic.trim().toLowerCase() === topic.trim().toLowerCase()).slice(0, 3);
  }

  if (selected.length === 0) {
    selected = map.slice(0, 3);
  }

  selected = uniqueBySectionId(selected);

  const parts = selected
    .map((s) => {
      const secTopic = s && typeof s.topic === 'string' ? s.topic.trim() : '';
      const secId = s && typeof s.sectionId === 'string' ? s.sectionId.trim() : '';
      const txt = s && typeof s.text === 'string' ? s.text.trim() : '';
      if (!txt) return '';
      const header = secTopic || secId ? `[${[secTopic, secId].filter(Boolean).join(' | ')}]` : '';
      return header ? `${header}\n${txt}` : txt;
    })
    .filter(Boolean);

  return clampText(parts.join('\n\n---\n\n'), maxChars);
}

function buildWebExcerpt({ webContext, maxChars }) {
  if (!webContext) return '';
  const title = typeof webContext.title === 'string' ? webContext.title.trim() : '';
  const url = typeof webContext.url === 'string' ? webContext.url.trim() : '';
  const headings = Array.isArray(webContext.headings) ? webContext.headings.map((h) => String(h || '').trim()).filter(Boolean).slice(0, 10) : [];
  const paragraph = typeof webContext.paragraph === 'string' ? webContext.paragraph.trim() : '';
  const lines = [];
  if (title) lines.push(`Title: ${title}`);
  if (url) lines.push(`URL: ${url}`);
  if (headings.length) lines.push(`Headings: ${headings.join(' | ')}`);
  if (paragraph) lines.push(`Text: ${paragraph}`);
  return clampText(lines.join('\n'), maxChars);
}

function makeExplainCacheKey({ topic, selectedSource, studyContext, webContext }) {
  const base = `${topic}::${selectedSource}`;
  if (selectedSource === 'study') {
    const contentId = studyContext && studyContext.contentId ? String(studyContext.contentId) : '';
    const sectionId = studyContext && typeof studyContext.sectionId === 'string' ? studyContext.sectionId : '';
    return `${base}::${contentId}:${sectionId}`;
  }
  const url = webContext && typeof webContext.url === 'string' ? webContext.url : '';
  const id = webContext && webContext._id ? String(webContext._id) : '';
  return `${base}::${url || id}`;
}

router.post('/explain', requireUserId, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: 'MongoDB not connected' });
    }

    const userId = String(req.body.userId || '').trim();

    const requestedTopic = typeof req.body.topic === 'string' ? req.body.topic.trim() : '';
    const modeRaw = typeof req.body.mode === 'string' ? req.body.mode.trim().toLowerCase() : '';
    const sourceRaw = typeof req.body.source === 'string' ? req.body.source.trim().toLowerCase() : '';
    const clientHeader = typeof req.headers['x-doubtsense-client'] === 'string'
      ? req.headers['x-doubtsense-client'].trim().toLowerCase()
      : '';

    // Best practice:
    // - Frontend/extension may suggest intent (mode)
    // - Backend remains final authority with fallbacks
    // - If mode is missing, default to auto, except extension-originated calls default to web
    let mode = 'auto';
    if (modeRaw === 'web' || modeRaw === 'study' || modeRaw === 'auto') {
      mode = modeRaw;
    } else if (sourceRaw === 'extension' || clientHeader === 'extension') {
      mode = 'web';
    }

    // Auto + time priority:
    // - If `topic` is explicitly provided, it always wins.
    // - Otherwise select between study Context and latest WebContextEvent.
    const [contextDoc, webContext] = await Promise.all([
      Context.findOne({ userId }).sort({ createdAt: -1 }).lean(),
      WebContextEvent.findOne({ userId }).sort({ createdAt: -1 }).lean(),
    ]);

    // IMPORTANT: Context is used by both study flows and website-mode updates.
    // For the decision engine, we treat "study" as non-website sessions only.
    const studyContext = contextDoc && contextDoc.sourceType !== 'website' ? contextDoc : null;

    const studyTime = (() => {
      const t = studyContext && (studyContext.updatedAt || studyContext.lastUpdated);
      const ms = t instanceof Date ? t.getTime() : Date.parse(String(t || ''));
      return Number.isFinite(ms) ? ms : 0;
    })();

    const webTime = (() => {
      const t = webContext && webContext.createdAt;
      const ms = t instanceof Date ? t.getTime() : Date.parse(String(t || ''));
      return Number.isFinite(ms) ? ms : 0;
    })();

    let selectedSource = 'study';
    if (mode === 'web') {
      selectedSource = 'web';
    } else if (mode === 'study') {
      selectedSource = 'study';
    } else {
      // AUTO
      if (webTime > studyTime) selectedSource = 'web';
      else selectedSource = 'study';
    }

    // Edge cases (as per spec)
    if (!studyContext && webContext) selectedSource = 'web';
    if (!webContext && studyContext) selectedSource = 'study';

    const pickFromStudy = () => {
      const t =
        (studyContext && typeof studyContext.activeTopic === 'string' ? studyContext.activeTopic : '') ||
        (studyContext && Array.isArray(studyContext.headings) && studyContext.headings[0]) ||
        (studyContext && studyContext.title) ||
        '';
      const raw = (studyContext && typeof studyContext.paragraph === 'string' ? studyContext.paragraph : '') || '';
      return { topic: t.trim(), paragraph: raw };
    };

    const pickFromWeb = () => {
      const t = (webContext && typeof webContext.topic === 'string' ? webContext.topic : '') || '';
      const raw = (webContext && typeof webContext.paragraph === 'string' ? webContext.paragraph : '') || '';
      return { topic: t.trim(), paragraph: raw };
    };

    const picked = selectedSource === 'web' ? pickFromWeb() : pickFromStudy();

    const topic = requestedTopic || picked.topic || 'General';

    const contextText = selectedSource === 'web'
      ? buildWebExcerpt({ webContext, maxChars: CONTEXT_PARAGRAPH_MAX_CHARS })
      : await buildStudyExcerpt({ studyContext, topic, maxChars: CONTEXT_PARAGRAPH_MAX_CHARS });

    // Hallucination guardrail: do not call the LLM if we don't have enough excerpt.
    // Keep response shape stable (HTTP 200, same keys).
    if (isInsufficientExcerpt(contextText, { source: selectedSource })) {
      console.log('[explain] INSUFFICIENT CONTEXT topic=%s source=%s', topic, selectedSource);
      return res.json({
        topic,
        level1: NOT_ENOUGH_CONTEXT_EXPLAIN_MESSAGE,
        level2: NOT_ENOUGH_CONTEXT_EXPLAIN_MESSAGE,
        level3: NOT_ENOUGH_CONTEXT_EXPLAIN_MESSAGE,
      });
    }

    // Cache check (biggest impact)
    const cacheKey = makeExplainCacheKey({ topic, selectedSource, studyContext, webContext });
    if (explanationCache.has(cacheKey)) {
      console.log('[explain] CACHE HIT topic=%s source=%s', topic, selectedSource);
      return res.json({ topic, ...explanationCache.get(cacheKey) });
    }

    const prompt = `You are a strict, accurate AI tutor.

Task: Explain the concept: "${topic}"

You MUST use ONLY the information inside the Context block below.
If the Context does not contain enough information to explain the concept accurately, you MUST return this exact message for ALL levels:
"${NOT_ENOUGH_CONTEXT_EXPLAIN_MESSAGE}"

Context:
"""
${contextText}
"""

Generate 3 levels:

LEVEL 1:
- Concept explanation only (no examples, no analogies)
- Clear technical terms
- Short (3–4 lines)

LEVEL 2:
- Include exactly:
  1) One real-world example grounded in the Context
  2) One simple everyday analogy grounded in the Context

LEVEL 3:
- Explain like to a 7-year-old
- Very simple words
- Use relatable objects (but still grounded in the Context)

Return ONLY JSON:
{
  "level1": "...",
  "level2": "...",
  "level3": "..."
}

Rules:
- level1, level2, level3 must be plain strings (NOT objects/arrays)
- Keep each level short (max ~40 words)
- If unsure, do NOT guess; use the exact not-enough-context message
- Do not add any extra keys`;

    console.log('[explain] CALLING OPENAI topic=%s', topic);

    let text = '';
    try {
      const client = getOpenAIClient();
      const model = getOpenAIModelName();
      const response = await withTimeout(
        client.responses.create({
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
          temperature: 0,
          top_p: 1,
          max_output_tokens: Number.isFinite(EXPLAIN_MAX_OUTPUT_TOKENS) && EXPLAIN_MAX_OUTPUT_TOKENS > 50 ? EXPLAIN_MAX_OUTPUT_TOKENS : 350,
        }),
        OPENAI_TIMEOUT_MS,
        'openai.responses.create'
      );
      text = getResponseText(response);
    } catch (err) {
      if (err && err.code === 'TIMEOUT') {
        console.warn('[explain] OPENAI TIMEOUT topic=%s', topic);
        return res.status(504).json({ error: 'Explain timed out', topic });
      }
      if (isRateLimitError(err)) {
        return res.status(429).json({ error: 'Rate limited', topic });
      }
      if (isMissingOpenAIKeyError(err)) {
        return res.status(500).json({ error: 'OPENAI_API_KEY is not set', topic });
      }
      throw err;
    }

    const parsed = safeParseLevels(text);
    if (parsed) {
      // Store in cache for future calls.
      explanationCache.set(cacheKey, parsed);
      return res.json({ topic, ...parsed });
    }

    // Fallback: keep response JSON-shape-safe even if the model violates instructions.
    const fallbackText = typeof text === 'string' && text.trim().length > 0
      ? text.trim()
      : 'Sorry — I could not generate an explanation right now.';

    // Do not fabricate explanation levels; surface parse failure explicitly.
    return res.status(502).json({ error: 'Failed to parse model response', topic, raw: fallbackText });
  } catch (err) {
    console.error('[explain] error', err);
    return res.status(500).json({ error: 'LLM failed' });
  }
});

router.post('/ask-doubt', requireUserId, async (req, res) => {
  try {
    const userId = String(req.body.userId || '').trim();
    const requestedTopic = typeof req.body.topic === 'string' ? req.body.topic.trim() : '';
    const modeRaw = typeof req.body.mode === 'string' ? req.body.mode.trim().toLowerCase() : '';
    const sourceRaw = typeof req.body.source === 'string' ? req.body.source.trim().toLowerCase() : '';
    const clientHeader = typeof req.headers['x-doubtsense-client'] === 'string'
      ? req.headers['x-doubtsense-client'].trim().toLowerCase()
      : '';

    let mode = 'auto';
    if (modeRaw === 'web' || modeRaw === 'study' || modeRaw === 'auto') {
      mode = modeRaw;
    } else if (sourceRaw === 'extension' || clientHeader === 'extension') {
      mode = 'web';
    }

    const [contextDoc, webContext] = await Promise.all([
      Context.findOne({ userId }).sort({ createdAt: -1 }).lean(),
      WebContextEvent.findOne({ userId }).sort({ createdAt: -1 }).lean(),
    ]);

    const studyContext = contextDoc && contextDoc.sourceType !== 'website' ? contextDoc : null;
    const studyTime = (() => {
      const t = studyContext && (studyContext.updatedAt || studyContext.lastUpdated);
      const ms = t instanceof Date ? t.getTime() : Date.parse(String(t || ''));
      return Number.isFinite(ms) ? ms : 0;
    })();
    const webTime = (() => {
      const t = webContext && webContext.createdAt;
      const ms = t instanceof Date ? t.getTime() : Date.parse(String(t || ''));
      return Number.isFinite(ms) ? ms : 0;
    })();

    let selectedSource = 'study';
    if (mode === 'web') selectedSource = 'web';
    else if (mode === 'study') selectedSource = 'study';
    else selectedSource = webTime > studyTime ? 'web' : 'study';

    if (!studyContext && webContext) selectedSource = 'web';
    if (!webContext && studyContext) selectedSource = 'study';

    const topic = requestedTopic || (selectedSource === 'web'
      ? (webContext && typeof webContext.topic === 'string' ? webContext.topic.trim() : '')
      : (studyContext && typeof studyContext.activeTopic === 'string' ? studyContext.activeTopic.trim() : '')
    ) || 'General';

    const question = typeof req.body.question === 'string' ? req.body.question.trim() : '';

    if (!question) {
      return res.status(400).json({ error: 'question is required' });
    }

    const trimmedQuestion = question.slice(0, 2000);

    const contextText = selectedSource === 'web'
      ? buildWebExcerpt({ webContext, maxChars: DOUBT_CONTEXT_MAX_CHARS })
      : await buildStudyExcerpt({ studyContext, topic, maxChars: DOUBT_CONTEXT_MAX_CHARS });

    if (isInsufficientExcerpt(contextText, { source: selectedSource })) {
      console.log('[ask-doubt] INSUFFICIENT CONTEXT topic=%s source=%s', topic, selectedSource);
      return res.json({ answer: NOT_ENOUGH_CONTEXT_DOUBT_MESSAGE });
    }

    const prompt = `You are a strict, accurate tutor.

You MUST use ONLY the excerpt inside the Study material block.
If it is insufficient to answer accurately, respond with this exact sentence and nothing else:
"${NOT_ENOUGH_CONTEXT_DOUBT_MESSAGE}"

Student is studying: "${topic}"

Study material excerpt:
"""
${contextText}
"""

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
        temperature: 0,
        top_p: 1,
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
