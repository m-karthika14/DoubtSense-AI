const DEFAULT_API_BASE = 'http://localhost:4000';

const APP_AGENT_KEY = 'doubtsense_agentActive';

// Confusion tracking (behavioral only; no face)
const CONFUSION_SEND_INTERVAL_MS = 5000;
const POPUP_COOLDOWN_MS = 30_000;
const PAUSE_CAP_SEC = 60;
const SCROLL_SPEED_CAP_PX_PER_SEC = 2000;
const REREAD_CAP_COUNT = 10;

let lastPopupAtMs = 0;
let popupRemoveTimer = null;
const POPUP_ID = 'doubtsense-confusion-popup';

let isPopupOpen = false;
let currentLevel = 1;
let explanations = {};
let explanationsLoaded = false;
let isExplainLoading = false;
let currentTopic = 'General';
let currentApiBase = DEFAULT_API_BASE;
let currentUserId = '';

// Behavior tracking refs (per tab/page)
let lastScrollAtMs = Date.now();
let lastScrollTop = 0;
let lastScrollSpeedPxPerSec = 0;
let reReadCountSinceLastSend = 0;
let lastBehaviorSentAtMs = 0;

function clamp(n, min, max) {
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function getScrollTop() {
  const el = document.scrollingElement || document.documentElement;
  if (el && typeof el.scrollTop === 'number') return el.scrollTop;
  return typeof window.scrollY === 'number' ? window.scrollY : 0;
}

function getAttentionScore() {
  // Normalized [0..1] fallback; no face tracking in extension.
  return document.hidden ? 0.3 : 0.6;
}

function getFatigueScore({ pauseTimeSec, scrollSpeed, attentionScore }) {
  // Repo-aligned heuristic from StudyView.tsx
  let fatigue = 0;
  if (pauseTimeSec > 8) fatigue += 0.4;
  if (scrollSpeed < 100) fatigue += 0.3;
  if (attentionScore < 0.5) fatigue += 0.3;
  return clamp(fatigue, 0, 1);
}

function extractTopicLightweight() {
  const title = (document.title || '').trim();
  if (title) return title;

  const h = document.querySelector('h1, h2');
  const ht = h && h.textContent ? h.textContent.trim() : '';
  return ht || 'General';
}

function removeHelpPopup() {
  const existing = document.getElementById(POPUP_ID);
  if (existing) existing.remove();
  if (popupRemoveTimer !== null) {
    clearTimeout(popupRemoveTimer);
    popupRemoveTimer = null;
  }
  isPopupOpen = false;
  currentLevel = 1;
  explanations = {};
  explanationsLoaded = false;
  isExplainLoading = false;
  currentTopic = 'General';
}

async function postFeedback({ understood }) {
  try {
    if (!currentApiBase || !currentUserId) return;
    await postJson(`${currentApiBase}/api/feedback`, {
      userId: currentUserId,
      topic: currentTopic,
      levelSeen: currentLevel,
      understood: Boolean(understood),
    });
  } catch {
    // ignore
  }
}

function ensureHelpPopupContainer() {
  const existing = document.getElementById(POPUP_ID);
  if (existing) return existing;

  const div = document.createElement('div');
  div.id = POPUP_ID;

  div.style.position = 'fixed';
  div.style.bottom = '20px';
  div.style.right = '20px';
  div.style.background = '#111';
  div.style.color = '#fff';
  div.style.padding = '12px';
  div.style.borderRadius = '10px';
  div.style.zIndex = '999999';
  // Size adapts to content up to a max, then scrolls.
  div.style.width = 'min(520px, 92vw)';
  div.style.maxWidth = '520px';
  div.style.maxHeight = '70vh';
  div.style.overflow = 'hidden';
  div.style.fontSize = '13px';
  div.style.lineHeight = '1.35';
  div.style.boxSizing = 'border-box';
  div.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';

  // Smooth transitions
  div.style.transition = 'opacity 150ms ease, transform 150ms ease';
  div.style.opacity = '0';
  div.style.transform = 'translateY(6px)';

  document.body.appendChild(div);
  requestAnimationFrame(() => {
    div.style.opacity = '1';
    div.style.transform = 'translateY(0px)';
  });

  return div;
}

function renderHelpPopup() {
  const container = ensureHelpPopupContainer();

  const levelText =
    currentLevel === 1
      ? explanations.level1
      : currentLevel === 2
        ? explanations.level2
        : explanations.level3;

  const headerHtml =
    currentLevel === 1
      ? `<div style="font-weight:600; margin-bottom:8px;">Need help with ${escapeHtml(currentTopic)}?</div>`
      : '';

  const showMoreButton =
    currentLevel < 3
      ? `<button id="ds-show-more" style="background:#222;border:1px solid #333;color:#fff;padding:6px 10px;border-radius:8px;font-size:12px;cursor:pointer;">Show More</button>`
      : '';

  const level3Extras =
    currentLevel === 3
      ? `
        <div style="margin-top:10px;">
          <input id="ds-doubt" type="text" placeholder="Ask your doubt..." style="width:100%;padding:8px 10px;border-radius:8px;border:1px solid #333;background:#0c0c0c;color:#fff;box-sizing:border-box;font-size:12px;" />
          <div style="margin-top:8px; display:flex; justify-content:flex-end;">
            <button id="ds-submit-doubt" style="background:#222;border:1px solid #333;color:#fff;padding:6px 10px;border-radius:8px;font-size:12px;cursor:pointer;">Submit</button>
          </div>
          <div id="ds-doubt-answer" style="margin-top:8px; font-size:12px; white-space:pre-wrap;"></div>
        </div>
      `
      : '';

  container.style.opacity = '0';
  container.style.transform = 'translateY(6px)';

  window.setTimeout(() => {
    container.innerHTML = `
      ${headerHtml}
      <div style="white-space:pre-wrap; max-height:45vh; overflow:auto; padding-right:4px;">${escapeHtml(String(levelText || ''))}</div>
      <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:10px; flex-wrap:wrap;">
        ${showMoreButton}
        <button id="ds-understand" style="background:#222;border:1px solid #333;color:#fff;padding:6px 10px;border-radius:8px;font-size:12px;cursor:pointer;">I Understand</button>
        <button id="ds-close" style="background:transparent;border:1px solid #333;color:#fff;padding:6px 10px;border-radius:8px;font-size:12px;cursor:pointer;">✕ Close</button>
      </div>
      ${level3Extras}
    `;

    requestAnimationFrame(() => {
      container.style.opacity = '1';
      container.style.transform = 'translateY(0px)';
    });

    const closeBtn = container.querySelector('#ds-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        removeHelpPopup();
      });
    }

    const understandBtn = container.querySelector('#ds-understand');
    if (understandBtn) {
      understandBtn.addEventListener('click', async () => {
        await postFeedback({ understood: true });
        removeHelpPopup();
      });
    }

    const showMoreBtn = container.querySelector('#ds-show-more');
    if (showMoreBtn) {
      showMoreBtn.addEventListener('click', async () => {
        // METHOD 3 — CALL ONLY ON USER ACTION
        // Only call /api/explain (LLM) when the user requests more (Level 2).
        if (currentLevel === 1 && !explanationsLoaded && !isExplainLoading) {
          isExplainLoading = true;
          explanations.level1 = 'Loading explanation...';
          renderHelpPopup();

          try {
            const resp = await postJson(`${currentApiBase}/api/explain`, {
              userId: currentUserId,
              agentActive: true,
              mode: 'web',
              source: 'extension',
            });
            if (!resp.ok) throw new Error('Explain failed');

            const data = resp.data && typeof resp.data === 'object' ? resp.data : {};
            currentTopic = typeof data.topic === 'string' && data.topic.trim().length > 0 ? data.topic.trim() : currentTopic;
            explanations = {
              level1: typeof data.level1 === 'string' ? data.level1 : '',
              level2: typeof data.level2 === 'string' ? data.level2 : '',
              level3: typeof data.level3 === 'string' ? data.level3 : '',
            };
            explanationsLoaded = true;
          } catch {
            explanations = {
              level1: 'Sorry — I could not load an explanation right now.',
              level2: 'Sorry — I could not load an explanation right now.',
              level3: 'Sorry — I could not load an explanation right now.',
            };
            explanationsLoaded = true;
          } finally {
            isExplainLoading = false;
          }

          currentLevel = 2;
          renderHelpPopup();
          return;
        }

        currentLevel = Math.min(3, currentLevel + 1);
        renderHelpPopup();
      });
    }

    const submitBtn = container.querySelector('#ds-submit-doubt');
    if (submitBtn) {
      submitBtn.addEventListener('click', async () => {
        const input = container.querySelector('#ds-doubt');
        const answerBox = container.querySelector('#ds-doubt-answer');
        const question = input && input.value ? String(input.value).trim() : '';
        if (!question) return;

        if (answerBox) answerBox.textContent = 'Thinking...';
        try {
          const resp = await postJson(`${currentApiBase}/api/ask-doubt`, {
            userId: currentUserId,
            mode: 'web',
            source: 'extension',
            question,
          });
          const answer = resp && resp.data && typeof resp.data.answer === 'string' ? resp.data.answer : '';
          if (answerBox) answerBox.textContent = answer || 'No answer returned.';
        } catch {
          if (answerBox) answerBox.textContent = 'Failed to get an answer.';
        }
      });
    }
  }, 80);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function startHelpPopupFlow({ apiBase, userId }) {
  const now = Date.now();
  if (isPopupOpen) return;
  if (now - lastPopupAtMs < POPUP_COOLDOWN_MS) return;
  lastPopupAtMs = now;

  // Ensure a single popup at a time
  removeHelpPopup();
  isPopupOpen = true;
  currentApiBase = apiBase;
  currentUserId = userId;

  explanationsLoaded = false;
  isExplainLoading = false;

  // Best-effort refresh context so Mongo has latest headings/paragraph
  try {
    await sendNow({ apiBase, userId, agentActive: true });
  } catch {
    // ignore
  }

  // Show a basic (no-LLM) Level 1 message immediately.
  currentTopic = extractTopicLightweight();
  explanations = {
    level1: 'I can explain this in more detail. Click “Show More” to get an explanation.',
    level2: '',
    level3: '',
  };
  currentLevel = 1;
  renderHelpPopup();
}

function isPdfUrl(url) {
  try {
    const u = new URL(url);
    return u.pathname.toLowerCase().endsWith('.pdf');
  } catch {
    return false;
  }
}

function extractHeadings() {
  const nodes = Array.from(document.querySelectorAll('h1,h2,h3'));
  const texts = nodes
    .map((n) => (n && n.textContent ? n.textContent.trim() : ''))
    .filter(Boolean);
  return texts.slice(0, 20);
}

function extractParagraph() {
  const ps = Array.from(document.querySelectorAll('p'));
  const candidate = ps
    .map((p) => (p && p.textContent ? p.textContent.trim() : ''))
    .find((t) => t && t.length >= 80);

  if (candidate) return candidate;

  const bodyText = (document.body && document.body.innerText ? document.body.innerText : '').trim();
  return bodyText.slice(0, 1200);
}

function isDoubtSenseWebAppPage() {
  // The DoubtSense webapp already posts INTERNAL context via POST /api/context with {topic, sectionId}.
  // If the extension also posts WEBSITE context, it can overwrite the active topic back to "General".
  try {
    const hasAgentKey = localStorage.getItem(APP_AGENT_KEY) !== null;
    const hasUserKey = localStorage.getItem('doubtsense_user') !== null;
    return hasAgentKey || hasUserKey;
  } catch {
    return false;
  }
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function postForm(url, formData) {
  const res = await fetch(url, { method: 'POST', body: formData });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function getJson(url) {
  const res = await fetch(url, { method: 'GET' });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function sendWebsiteContext({ apiBase, userId, importantContent }) {
  const payload = {
    userId,
    agentActive: true,
    source: 'extension',
    title: document.title || '',
    headings: extractHeadings(),
    paragraph: extractParagraph(),
    url: location.href,
    importantContent: Boolean(importantContent),
  };

  return postJson(`${apiBase}/api/context`, payload);
}

async function trySendExternalPdf({ apiBase, userId }) {
  const url = location.href;

  // Extension has host_permissions; this often works even when page CORS would block.
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch PDF: ${res.status}`);

  const blob = await res.blob();
  const fileName = 'external.pdf';
  const file = new File([blob], fileName, { type: 'application/pdf' });

  const form = new FormData();
  form.append('userId', userId);
  form.append('agentActive', 'true');
  form.append('sourceType', 'external_pdf');
  form.append('sourceUrl', url);
  form.append('title', document.title || url);
  form.append('file', file);

  return postForm(`${apiBase}/api/upload`, form);
}

async function syncAgentActiveFromLocalStorageIfPresent() {
  try {
    const raw = localStorage.getItem(APP_AGENT_KEY);
    if (raw === null) return;
    const agentActive = raw === 'true';
    await chrome.storage.sync.set({ agentActive });
  } catch {
    // ignore
  }
}

async function verifyAgentActiveWithBackend({ apiBase, userId }) {
  try {
    const result = await getJson(`${apiBase}/api/agent/status?userId=${encodeURIComponent(userId)}`);
    if (!result.ok) return;
    const backendActive = Boolean(result.data && result.data.state && result.data.state.agentActive);
    await chrome.storage.sync.set({ agentActive: backendActive, agentLastVerifiedAt: Date.now() });
  } catch {
    // ignore
  }
}

async function getEffectiveAgentActive({ apiBase, userId }) {
  // Reuse the same cached verification pattern as sendNow.
  const config = await chrome.storage.sync.get({ agentActive: false, agentLastVerifiedAt: 0 });
  const lastVerified = Number(config.agentLastVerifiedAt || 0);
  const shouldVerify = Date.now() - lastVerified > 60 * 1000;
  if (shouldVerify) {
    await verifyAgentActiveWithBackend({ apiBase, userId });
  }
  const refreshed = await chrome.storage.sync.get({ agentActive: false });
  return Boolean(refreshed.agentActive);
}

async function postConfusionPredict({ apiBase, userId, topic, behavior_vector }) {
  const nowMs = Date.now();
  const res = await fetch(`${apiBase}/api/confusion/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      agentActive: true,
      topic,
      // Send both keys; backend treats `features` as alias too.
      features: behavior_vector,
      behavior_vector,
      timestamp: Math.floor(nowMs / 1000),
    }),
  });

  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

function initBehaviorTracking() {
  lastScrollAtMs = Date.now();
  lastScrollTop = getScrollTop();

  const onScroll = () => {
    const now = Date.now();
    const y = getScrollTop();

    const dy = y - lastScrollTop;
    const dtSec = Math.max(0.001, (now - lastScrollAtMs) / 1000);

    // re-read == user scrolls upward
    if (dy < 0) reReadCountSinceLastSend += 1;

    lastScrollSpeedPxPerSec = Math.abs(dy) / dtSec;
    lastScrollTop = y;
    lastScrollAtMs = now;
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  return () => window.removeEventListener('scroll', onScroll);
}

async function startConfusionLoop() {
  const config = await chrome.storage.sync.get({
    apiBase: DEFAULT_API_BASE,
    userId: '',
  });

  const apiBase = String(config.apiBase || DEFAULT_API_BASE).trim();
  const userId = String(config.userId || '').trim();
  if (!userId) return;

  let stopped = false;

  const tick = async () => {
    if (stopped) return;

    // Cooldown guard in case interval duplicates due to reinits
    const nowMs = Date.now();
    if (nowMs - lastBehaviorSentAtMs < CONFUSION_SEND_INTERVAL_MS) return;

    await syncAgentActiveFromLocalStorageIfPresent();

    const agentActive = await getEffectiveAgentActive({ apiBase, userId });
    if (!agentActive) return;

    const pauseTimeSec = clamp((nowMs - lastScrollAtMs) / 1000, 0, PAUSE_CAP_SEC);
    const scrollSpeed = clamp(lastScrollSpeedPxPerSec || 0, 0, SCROLL_SPEED_CAP_PX_PER_SEC);
    const reReadCount = clamp(reReadCountSinceLastSend || 0, 0, REREAD_CAP_COUNT);

    const attentionScore = getAttentionScore();
    const fatigueScore = getFatigueScore({ pauseTimeSec, scrollSpeed, attentionScore });

    const behavior_vector = [
      +pauseTimeSec.toFixed(3),
      +scrollSpeed.toFixed(3),
      reReadCount,
      +attentionScore.toFixed(3),
      +fatigueScore.toFixed(3),
    ];

    // Reset reRead count so it reflects recent behavior
    reReadCountSinceLastSend = 0;

    const topic = extractTopicLightweight();

    try {
      const result = await postConfusionPredict({ apiBase, userId, topic, behavior_vector });
      const confused = Boolean(result.data && typeof result.data === 'object' && result.data.confusion === true);
      if (confused) {
        await startHelpPopupFlow({ apiBase, userId });
      }
    } catch {
      // ignore (backend/ML may be offline)
    } finally {
      lastBehaviorSentAtMs = nowMs;
    }
  };

  // fire immediately and then interval
  await tick();
  const id = window.setInterval(() => {
    void tick();
  }, CONFUSION_SEND_INTERVAL_MS);

  return () => {
    stopped = true;
    window.clearInterval(id);
  };
}

async function sendNow(configOverride) {
  await syncAgentActiveFromLocalStorageIfPresent();

  const config = await chrome.storage.sync.get({
    apiBase: DEFAULT_API_BASE,
    userId: '',
    importantContent: false,
    agentActive: false,
    agentLastVerifiedAt: 0,
  });

  const apiBase = String(configOverride?.apiBase || config.apiBase || DEFAULT_API_BASE).trim();
  const userId = String(configOverride?.userId || config.userId || '').trim();
  const importantContent = Boolean(
    typeof configOverride?.importantContent === 'boolean'
      ? configOverride.importantContent
      : config.importantContent
  );

  const agentActive = Boolean(
    typeof configOverride?.agentActive === 'boolean' ? configOverride.agentActive : config.agentActive
  );

  // Fail-safe backend verification (cached): if we haven't verified recently, refresh from server.
  // This avoids desync when local storage didn't update (logout/tab switch/etc.).
  const lastVerified = Number(config.agentLastVerifiedAt || 0);
  const shouldVerify = Date.now() - lastVerified > 60 * 1000; // 60s
  if (shouldVerify) {
    await verifyAgentActiveWithBackend({ apiBase, userId });
  }

  const refreshed = await chrome.storage.sync.get({ agentActive: false });
  const effectiveAgentActive = Boolean(
    typeof configOverride?.agentActive === 'boolean' ? configOverride.agentActive : refreshed.agentActive
  );

  if (!userId) return { ok: false, error: 'Missing userId' };
  if (!effectiveAgentActive) return { ok: true, skipped: true, reason: 'Agent is OFF' };

  if (isDoubtSenseWebAppPage()) {
    return { ok: true, skipped: true, reason: 'DoubtSense webapp posts internal context' };
  }

  try {
    if (isPdfUrl(location.href)) {
      // External PDF mode: try upload; if it fails, fall back to website context update.
      try {
        const pdfResult = await trySendExternalPdf({ apiBase, userId });
        if (pdfResult.ok) return { ok: true, mode: 'external_pdf', data: pdfResult.data };
      } catch {
        // ignore and fall back
      }
    }

    const websiteResult = await sendWebsiteContext({ apiBase, userId, importantContent });
    return { ok: websiteResult.ok, mode: 'website', data: websiteResult.data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Request failed' };
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'DOUBTSENSE_SEND_NOW') {
    sendNow(msg).then((result) => sendResponse(result));
    return true;
  }
  return false;
});

// Lightweight auto-send: once on load, and when the tab becomes visible again.
(async function init() {
  // Existing context sync
  await sendNow();

  // Behavior-based confusion tracking
  const cleanupScroll = initBehaviorTracking();
  const cleanupLoop = await startConfusionLoop();

  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
      await sendNow();
    }
  });

  // Best-effort cleanup (page nav/unload)
  window.addEventListener('beforeunload', () => {
    try {
      cleanupScroll && cleanupScroll();
      cleanupLoop && cleanupLoop();
    } catch {
      // ignore
    }
  });
})();
