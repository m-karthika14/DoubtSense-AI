const DEFAULT_API_BASE = 'http://localhost:4000';

function $(id) {
  return document.getElementById(id);
}

function setStatus(message) {
  const el = $('status');
  if (el) el.textContent = message;
}

function normalizeUserId(input) {
  const raw = String(input || '').trim().toLowerCase();
  if (!raw) return '';

  // Auto-fix common forms like:
  // - "John 123" -> "john_123"
  // - "john-123" -> "john_123"
  // - "john__123" -> "john_123"
  let cleaned = raw
    .replace(/\s+/g, '_')
    .replace(/-+/g, '_')
    .replace(/_+/g, '_');

  // If it's like "john123", split into "john_123".
  const glued = cleaned.match(/^([a-z]+)(\d+)$/);
  if (glued) cleaned = `${glued[1]}_${glued[2]}`;

  // Keep only a-z, 0-9, and underscore (after lowercasing).
  cleaned = cleaned.replace(/[^a-z0-9_]/g, '');

  // Ensure exactly one underscore between name and numbers.
  const parts = cleaned.split('_').filter(Boolean);
  if (parts.length >= 2) {
    const namePart = parts[0].replace(/[^a-z]/g, '');
    const numberPart = parts.slice(1).join('').replace(/\D/g, '');
    if (namePart && numberPart) return `${namePart}_${numberPart}`;
  }

  return cleaned;
}

function isValidUserId(userId) {
  return /^[a-z]+_[0-9]+$/.test(String(userId || ''));
}

async function verifyAgentWithBackend(apiBase, userId) {
  if (!apiBase || !userId) return;
  try {
    const res = await fetch(`${apiBase}/api/agent/status?userId=${encodeURIComponent(userId)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return;
    const agentActive = Boolean(data?.state?.agentActive);
    await chrome.storage.sync.set({ agentActive, agentLastVerifiedAt: Date.now() });
  } catch {
    // ignore
  }
}

async function loadConfig() {
  const config = await chrome.storage.sync.get({
    apiBase: DEFAULT_API_BASE,
    userId: '',
    importantContent: false,
    agentActive: false,
  });

  $('apiBase').value = config.apiBase || DEFAULT_API_BASE;
  $('userId').value = config.userId || '';
  $('importantContent').checked = Boolean(config.importantContent);
  setStatus(`Agent Status: ${config.agentActive ? 'ON' : 'OFF'}`);
}

async function saveConfig() {
  const apiBase = $('apiBase').value.trim() || DEFAULT_API_BASE;
  const userIdInput = $('userId').value;
  const normalizedUserId = normalizeUserId(userIdInput);
  const importantContent = $('importantContent').checked;

  if (!normalizedUserId || !isValidUserId(normalizedUserId)) {
    setStatus('Invalid userid. Use: name_123');
    return false;
  }

  $('userId').value = normalizedUserId;
  await chrome.storage.sync.set({ apiBase, userId: normalizedUserId, importantContent });
  setStatus('Saved');
  return true;
}

async function sendNow() {
  const { apiBase, userId, importantContent } = await chrome.storage.sync.get({
    apiBase: DEFAULT_API_BASE,
    userId: '',
    importantContent: false,
  });

  if (!userId) {
    setStatus('Set userId first');
    return;
  }

  setStatus('Sending…');

  // Fail-safe: refresh agentActive from backend before sending.
  await verifyAgentWithBackend(apiBase, userId);

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    setStatus('No active tab');
    return;
  }

  // Ask content script to send payload immediately.
  chrome.tabs.sendMessage(
    tab.id,
    { type: 'DOUBTSENSE_SEND_NOW', apiBase, userId, importantContent },
    (response) => {
      const err = chrome.runtime.lastError;
      if (err) {
        setStatus('Unable to message tab (reload page)');
        return;
      }
      if (response && response.skipped) {
        setStatus('Skipped (Agent OFF)');
        return;
      }
      setStatus(response && response.ok ? 'Sent' : 'Failed');
    }
  );
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadConfig();

  $('save').addEventListener('click', async () => {
    await saveConfig();
  });

  $('sendNow').addEventListener('click', async () => {
    const ok = await saveConfig();
    if (!ok) return;
    await sendNow();
  });
});
