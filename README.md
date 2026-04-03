# DoubtSense-AI

Lightweight frontend for DoubtSense — built with Vite + React + TypeScript.

Getting started

Prerequisites:
- Node.js 16+ (or your project's required version)

Run the frontend dev server:

```bash
cd project
npm install
npm run dev
```

Run the backend API (needed for uploads, context, face-data, and confusion logging):

```bash
cd backend
npm install
npm run dev
```

If your backend is not on port 4000, set the frontend env var:

- `VITE_API_URL` (example: `http://localhost:4001`)

Build for production:

```bash
cd project
npm run build
```

Project structure

- `src/` — application source
- `index.html`, `vite.config.ts` — Vite entry

License

This project is licensed under the MIT License — see `LICENSE`.

Notes

Behavior vector → ML (Study page)

- The Study page streams a `behavior_vector` to an external ML endpoint every ~5 seconds while **Agent** is ON and a document is open.
- Payload sent to the ML endpoint:
	- `student_id`: user id (guest or registered)
	- `topic`: current topic shown in the Study page
	- `behavior_vector`: `[pauseTimeSec, scrollSpeedPxPerSec, reReadCount, attentionScore, fatigueScore]`
	- `timestamp`: unix time (seconds)

ML response shape (confusion detection)

- The frontend treats the user as “confused” if the JSON response contains either `{"confusion": true}` / `{"confusion": 1}` or any key containing the substring `confusion` with value `true` or `1`.
	- Examples: `{ "confusion": true }`, `{ "lr_confusion": 1, "rf_confusion": 0 }`

Frontend env vars (optional):

- `VITE_ML_PREDICT_URL` (preferred): full URL for the prediction endpoint (default: `http://localhost:8000/predict`)
- `VITE_ML_API_URL` (fallback): base URL; the app will call `${VITE_ML_API_URL}/predict`

Face tracking (Study page)

- The Study page now includes a face-tracking popup that appears only when **Agent** and **Camera** are both ON.
- MediaPipe FaceMesh (red overlay) works via CDN-loaded assets.
- Emotion recognition uses `face-api.js` and requires model files to be served by Vite.
	Put the face-api model files under:

	- `project/public/models/`

	At minimum, include TinyFaceDetector and FaceExpressionNet model files (their manifest + shard files). If models are missing, the UI will still show the red mesh + presence/attention, but emotion will remain `neutral`.

If you plan to publish this repository to GitHub from this machine, make sure your Git credentials (or a personal access token) are configured for the push.
