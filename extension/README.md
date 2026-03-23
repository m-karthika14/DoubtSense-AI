# DoubtSense AI Chrome Extension (Minimal)

This extension sends the student's current browsing/reading context to the DoubtSense backend.

## What it does

- Sends tracking ONLY when Agent is ON (synced from the web app)
- When Agent is ON, it updates real-time context via `POST /api/context`
- Conditionally stores website content into `contents` when `importantContent=true`
- Attempts external PDF handling:
  - If the current URL ends with `.pdf`, it tries to fetch the PDF and upload it to `POST /api/upload` with `sourceType=external_pdf`
  - If it cannot fetch/upload, it falls back to a website-mode context update

## Setup

1. Start your backend (example):
   - `cd backend`
   - `node server.js` (defaults to `http://localhost:4000`)

2. Load extension in Chrome:
   - `chrome://extensions`
   - Enable **Developer mode**
   - Click **Load unpacked**
   - Select this folder: `doubtsenseAI/extension`

3. Click the extension icon and set:
   - **API Base URL** (example: `http://localhost:4000`)
   - **userId** (use the `userId` returned by `/api/auth/guest` or from your app’s localStorage `doubtsense_user.userId`)

   ## Upload field name

   For `POST /api/upload`, the multipart field name is now `file` (not `pdf`).

## Agent ON/OFF gating (important)

The extension will only send data when Agent is ON.

- The web app persists Agent state in localStorage: `doubtsense_agentActive` (`"true"` / `"false"`).
- When you visit the web app with the extension installed, the content script copies that value into `chrome.storage.sync` as `agentActive`.
- On any other site, the extension checks `agentActive` before sending. If it is OFF, it does nothing.

## Payload (website mode)

`POST /api/context`

```json
{
  "userId": "...",
  "title": "...",
  "headings": ["..."],
  "paragraph": "...",
  "url": "...",
  "importantContent": false
}
```
