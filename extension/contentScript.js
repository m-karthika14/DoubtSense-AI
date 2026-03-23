const DEFAULT_API_BASE = 'http://localhost:4000';

const APP_AGENT_KEY = 'doubtsense_agentActive';

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
  await sendNow();

  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
      await sendNow();
    }
  });
})();
