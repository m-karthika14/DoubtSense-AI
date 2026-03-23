const DEFAULT_API_BASE = 'http://localhost:4000';

function $(id) {
  return document.getElementById(id);
}

function setStatus(message) {
  const el = $('status');
  if (el) el.textContent = message;
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
  const userId = $('userId').value.trim();
  const importantContent = $('importantContent').checked;

  await chrome.storage.sync.set({ apiBase, userId, importantContent });
  setStatus('Saved');
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
    await saveConfig();
    await sendNow();
  });
});
