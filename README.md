# DoubtSense-AI

Lightweight frontend for DoubtSense — built with Vite + React + TypeScript.

Getting started

Prerequisites:
- Node.js 16+ (or your project's required version)

Install dependencies and run the dev server:

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
```

Project structure

- `src/` — application source
- `index.html`, `vite.config.ts` — Vite entry

License

This project is licensed under the MIT License — see `LICENSE`.

Notes

Face tracking (Study page)

- The Study page now includes a face-tracking popup that appears only when **Agent** and **Camera** are both ON.
- MediaPipe FaceMesh (red overlay) works via CDN-loaded assets.
- Emotion recognition uses `face-api.js` and requires model files to be served by Vite.
	Put the face-api model files under:

	- `project/public/models/`

	At minimum, include TinyFaceDetector and FaceExpressionNet model files (their manifest + shard files). If models are missing, the UI will still show the red mesh + presence/attention, but emotion will remain `neutral`.

If you plan to publish this repository to GitHub from this machine, make sure your Git credentials (or a personal access token) are configured for the push.
