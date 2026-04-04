const { getOpenAIClient, getOpenAIModelName, getResponseText } = require('./openaiClient');

function detectTopic(rawText) {
  const text = String(rawText || '').toLowerCase();

  const has = (re) => re.test(text);

  if (has(/\bbinary\s+trees?\b/i)) {
    return { topic: 'Binary Trees', matchedKeyword: 'binary tree' };
  }

  // IMPORTANT: word boundaries prevent false positives like "photoGRAPH".
  if (has(/\bgraphs?\b/i)) {
    return { topic: 'Graphs', matchedKeyword: 'graph' };
  }

  if (has(/\barrays?\b/i)) {
    return { topic: 'Arrays', matchedKeyword: 'array' };
  }

  return { topic: 'General', matchedKeyword: null };
}

function normalizeTitleAsTopic(title) {
  const raw = typeof title === 'string' ? title.trim() : '';
  if (!raw) return '';

  // Strip common extensions and overly-generic filenames.
  const noExt = raw.replace(/\.(pdf|docx|doc|pptx|ppt)$/i, '').trim();
  if (!noExt) return '';
  if (/^(uploaded|document|notes|slides|lecture|file)$/i.test(noExt)) return '';

  // Bound length for UI + prompts.
  return noExt.length > 60 ? noExt.slice(0, 60).trim() : noExt;
}

function safeParseJson(text) {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
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

const openAiTopicCache = new Map();
const MAX_CACHE_ITEMS = 500;

const TOPIC_DETECTION_MAX_CHARS = Number(process.env.TOPIC_DETECTION_MAX_CHARS || 4000);

async function detectTopicSmart(rawText, { fallbackTitle } = {}) {
  const original = typeof rawText === 'string' ? rawText : String(rawText || '');
  const trimmed = original.trim();

  // Fast local heuristic first.
  const quick = detectTopic(trimmed);
  if (quick && typeof quick.topic === 'string' && quick.topic !== 'General') return quick;

  // OpenAI attempt (best-effort). If OPENAI_API_KEY isn't set, openaiClient throws.
  if (trimmed) {
    const maxChars = Number.isFinite(TOPIC_DETECTION_MAX_CHARS) && TOPIC_DETECTION_MAX_CHARS > 200
      ? TOPIC_DETECTION_MAX_CHARS
      : 4000;
    const clipped = trimmed.length > maxChars ? trimmed.slice(0, maxChars) : trimmed;
    const cacheKey = clipped;
    if (openAiTopicCache.has(cacheKey)) {
      return { topic: openAiTopicCache.get(cacheKey), matchedKeyword: null };
    }

    try {
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

      const response = await client.responses.create({
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
        temperature: 0,
        top_p: 1,
        max_output_tokens: 60,
      });

      const out = getResponseText(response);
      const parsed = safeParseJson(out);
      const topic = parsed && typeof parsed.topic === 'string' ? parsed.topic.trim() : '';

      if (topic) {
        if (openAiTopicCache.size >= MAX_CACHE_ITEMS) {
          const firstKey = openAiTopicCache.keys().next().value;
          if (firstKey) openAiTopicCache.delete(firstKey);
        }
        openAiTopicCache.set(cacheKey, topic);
        return { topic, matchedKeyword: null };
      }
    } catch {
      // swallow: we will fall back below
    }
  }

  const titleTopic = normalizeTitleAsTopic(fallbackTitle);
  if (titleTopic) return { topic: titleTopic, matchedKeyword: null };

  return { topic: 'General', matchedKeyword: null };
}

module.exports = { detectTopic, detectTopicSmart };
