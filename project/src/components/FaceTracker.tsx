import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FaceMesh, FACEMESH_TESSELATION, FACEMESH_FACE_OVAL, FACEMESH_LIPS } from '@mediapipe/face_mesh';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';
import * as faceapi from 'face-api.js';

export type FaceTrackerSnapshot = {
  present: boolean;
  // Continuous attention signal in range 0..1 (smoothed).
  attention_score: number;
  emotion: string;
  emotion_score: number;
  timestamp: string;
};

type Props = {
  enabled: boolean;
  apiBaseUrl: string;
  studentId?: string;
  sendIntervalMs?: number;
  onSnapshot?: (snapshot: FaceTrackerSnapshot) => void;
};

function mapEmotion(expression: string): 'happy' | 'sad' | 'frustrated' | 'neutral' {
  const e = String(expression || '').toLowerCase();
  if (e === 'happy') return 'happy';
  if (e === 'sad') return 'sad';
  if (e === 'angry') return 'frustrated';
  if (e === 'disgusted') return 'frustrated';
  if (e === 'fearful') return 'frustrated';
  if (e === 'surprised') return 'neutral';
  if (e === 'neutral') return 'neutral';
  return 'neutral';
}

function pickTopExpression(expressions: Record<string, number> | undefined | null) {
  if (!expressions) return null;
  const entries = Object.entries(expressions).filter(([, v]) => typeof v === 'number' && Number.isFinite(v));
  if (entries.length === 0) return null;
  entries.sort((a, b) => b[1] - a[1]);
  return { expression: entries[0][0], score: entries[0][1] };
}

function clamp01(value: unknown) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function pushAndAverage(history: number[], current: number, maxLen: number) {
  history.push(current);
  while (history.length > maxLen) history.shift();
  if (history.length === 0) return current;
  const sum = history.reduce((a, b) => a + b, 0);
  return sum / history.length;
}

function waitForLoadedMetadata(videoEl: HTMLVideoElement, timeoutMs: number) {
  if (videoEl.readyState >= 1) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    let done = false;
    const onLoaded = () => {
      if (done) return;
      done = true;
      cleanup();
      resolve();
    };
    const onError = () => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error('Video element failed to load camera metadata'));
    };
    const timeoutId = window.setTimeout(() => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error('Timed out waiting for camera video metadata'));
    }, timeoutMs);

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      videoEl.removeEventListener('loadedmetadata', onLoaded);
      videoEl.removeEventListener('error', onError);
    };

    videoEl.addEventListener('loadedmetadata', onLoaded);
    videoEl.addEventListener('error', onError);
  });
}

export function FaceTracker({
  enabled,
  apiBaseUrl,
  studentId,
  sendIntervalMs = 2000,
  onSnapshot,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const faceMeshRef = useRef<any | null>(null);

  const lastPresenceRef = useRef<boolean>(false);
  const lastEmotionRef = useRef<{ emotion: string; score: number }>({ emotion: 'neutral', score: 0 });
  const lastDetectionScoreRef = useRef<number>(0);
  const attentionHistoryRef = useRef<number[]>([]);
  const lastEmotionInferAtMsRef = useRef<number>(0);
  const startInProgressRef = useRef<boolean>(false);
  const lastOverlayDrawAtMsRef = useRef<number>(0);
  const meshInFlightRef = useRef<boolean>(false);
  const meshDisabledRef = useRef<boolean>(false);
  const meshErrorCountRef = useRef<number>(0);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [modelsReady, setModelsReady] = useState(false);
  const [isVisible, setIsVisible] = useState(() => document.visibilityState === 'visible');
  const onSnapshotRef = useRef<Props['onSnapshot']>(onSnapshot);

  useEffect(() => {
    onSnapshotRef.current = onSnapshot;
  }, [onSnapshot]);

  const canRun = enabled && isVisible;

  const localModelsBaseUrl = useMemo(() => '/models', []);
  const fallbackModelsBaseUrl = useMemo(() => 'https://justadudewhohacks.github.io/face-api.js/models', []);

  const syncCanvasSize = useCallback(() => {
    const videoEl = videoRef.current;
    const canvasEl = canvasRef.current;
    if (!videoEl || !canvasEl) return;

    const vw = videoEl.videoWidth;
    const vh = videoEl.videoHeight;
    if (!vw || !vh) return;

    if (canvasEl.width !== vw) canvasEl.width = vw;
    if (canvasEl.height !== vh) canvasEl.height = vh;

    const cw = videoEl.clientWidth;
    const ch = videoEl.clientHeight;
    if (cw && ch) {
      canvasEl.style.width = `${cw}px`;
      canvasEl.style.height = `${ch}px`;
    }
  }, []);

  // Stop camera tracks + processing
  const stopAll = useCallback(() => {
    try {
      if (faceMeshRef.current && typeof faceMeshRef.current.close === 'function') {
        faceMeshRef.current.close();
      }
    } catch {
      // ignore
    }
    faceMeshRef.current = null;

    const stream = streamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) {
        try {
          track.stop();
        } catch {
          // ignore
        }
      }
    }
    streamRef.current = null;

    const videoEl = videoRef.current;
    if (videoEl) {
      videoEl.srcObject = null;
    }

    const canvasEl = canvasRef.current;
    if (canvasEl) {
      const ctx = canvasEl.getContext('2d');
      ctx?.clearRect(0, 0, canvasEl.width, canvasEl.height);
    }

    lastPresenceRef.current = false;
    lastEmotionRef.current = { emotion: 'neutral', score: 0 };
    lastDetectionScoreRef.current = 0;
    meshInFlightRef.current = false;
    meshDisabledRef.current = false;
    meshErrorCountRef.current = 0;
  }, []);

  useEffect(() => {
    const onVis = () => setIsVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // Load face-api models once.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        try {
          await faceapi.nets.tinyFaceDetector.loadFromUri(localModelsBaseUrl);
          await faceapi.nets.faceExpressionNet.loadFromUri(localModelsBaseUrl);
        } catch {
          // Fallback: allow running without shipping model files in /public/models
          await faceapi.nets.tinyFaceDetector.loadFromUri(fallbackModelsBaseUrl);
          await faceapi.nets.faceExpressionNet.loadFromUri(fallbackModelsBaseUrl);
        }
        if (cancelled) return;
        setModelsReady(true);
      } catch (err) {
        if (cancelled) return;
        console.warn('[face-api] model load failed; emotion detection disabled', err);
        setModelsReady(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fallbackModelsBaseUrl, localModelsBaseUrl]);

  // Start webcam stream when enabled & visible.
  useEffect(() => {
    if (!canRun) {
      startInProgressRef.current = false;
      stopAll();
      return;
    }

    // Guard against duplicate startup loops in fast toggles / StrictMode remounts.
    if (startInProgressRef.current) return;
    startInProgressRef.current = true;

    let cancelled = false;

    (async () => {
      setCameraError(null);

      const videoEl = videoRef.current;
      if (!videoEl) return;

      try {
        if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
          throw new Error('Camera is not supported in this browser/context');
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 320, max: 640 },
            height: { ideal: 240, max: 480 },
            frameRate: { ideal: 12, max: 15 },
            facingMode: 'user',
          },
          audio: false,
        });
        if (cancelled) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        streamRef.current = stream;
        videoEl.srcObject = stream;

        await waitForLoadedMetadata(videoEl, 5000);

        try {
          await videoEl.play();
        } catch (e) {
          // Common on some browsers if play is blocked; surface the error instead of hanging silently.
          const msg = e instanceof Error ? e.message : 'Unable to start camera video playback';
          throw new Error(msg);
        }

        const faceMesh = new FaceMesh({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
        });

        faceMesh.setOptions({
          maxNumFaces: 1,
          refineLandmarks: false,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        faceMesh.onResults((results: any) => {
          const canvasEl = canvasRef.current;
          const ctx = canvasEl?.getContext('2d');
          if (!canvasEl || !ctx) return;

          const now = Date.now();
          const OVERLAY_DRAW_INTERVAL_MS = 150;
          if (now - lastOverlayDrawAtMsRef.current < OVERLAY_DRAW_INTERVAL_MS) return;
          lastOverlayDrawAtMsRef.current = now;

          syncCanvasSize();
          ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

          const landmarks = results?.multiFaceLandmarks?.[0];
          const present = Boolean(landmarks && Array.isArray(landmarks) && landmarks.length > 0);
          lastPresenceRef.current = present;

          if (!present) return;

          const color = '#FF0000';
          drawConnectors(ctx, landmarks, FACEMESH_TESSELATION, { color, lineWidth: 1 });
          drawConnectors(ctx, landmarks, FACEMESH_FACE_OVAL, { color, lineWidth: 2 });
          drawConnectors(ctx, landmarks, FACEMESH_LIPS, { color, lineWidth: 2 });
          drawLandmarks(ctx, landmarks, { color, radius: 1 });
        });

        faceMeshRef.current = faceMesh;
        syncCanvasSize();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unable to access camera';
        setCameraError(msg);
        stopAll();
      } finally {
        startInProgressRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
      startInProgressRef.current = false;
      stopAll();
    };
  }, [canRun, stopAll, syncCanvasSize]);

  // Run FaceMesh processing loop at a safe low frequency.
  useEffect(() => {
    if (!canRun) return;
    if (meshDisabledRef.current) return;

    const videoEl = videoRef.current;
    const faceMesh = faceMeshRef.current;
    if (!videoEl || !faceMesh) return;

    let stopped = false;
    let timer: number | null = null;

    const tick = async () => {
      if (stopped) return;
      if (meshInFlightRef.current) return;
      if (!faceMeshRef.current || !videoRef.current || !streamRef.current) return;

      meshInFlightRef.current = true;
      try {
        await faceMeshRef.current.send({ image: videoRef.current });
        meshErrorCountRef.current = 0;
      } catch {
        meshErrorCountRef.current += 1;
        if (meshErrorCountRef.current >= 6) {
          meshDisabledRef.current = true;
          const canvasEl = canvasRef.current;
          const ctx = canvasEl?.getContext('2d');
          if (canvasEl && ctx) ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
        }
      } finally {
        meshInFlightRef.current = false;
      }
    };

    timer = window.setInterval(() => {
      void tick();
    }, 250);

    return () => {
      stopped = true;
      if (timer !== null) window.clearInterval(timer);
      meshInFlightRef.current = false;
    };
  }, [canRun]);

  useEffect(() => {
    if (!enabled) return;
    const onResize = () => syncCanvasSize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [enabled, syncCanvasSize]);

  const inferEmotion = useCallback(async () => {
    if (!modelsReady) {
      lastEmotionRef.current = { emotion: 'neutral', score: 0 };
      lastDetectionScoreRef.current = 0;
      return;
    }

    const videoEl = videoRef.current;
    if (!videoEl) return;

    // Emotion inference is expensive; cap its frequency to keep the UI responsive.
    const nowMs = Date.now();
    const EMOTION_MIN_INTERVAL_MS = 4000;
    if (nowMs - (lastEmotionInferAtMsRef.current || 0) < EMOTION_MIN_INTERVAL_MS) return;
    lastEmotionInferAtMsRef.current = nowMs;

    try {
      const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 128, scoreThreshold: 0.4 });
      const detection = await faceapi
        .detectSingleFace(videoEl, options)
        .withFaceExpressions();

      const present = Boolean(detection?.detection);
      lastPresenceRef.current = present;

      // detection confidence (0..1) from face-api
      lastDetectionScoreRef.current = clamp01(detection?.detection?.score);

      const top = pickTopExpression(detection?.expressions as any);
      if (!top) {
        lastEmotionRef.current = { emotion: 'neutral', score: 0 };
        return;
      }

      const mapped = mapEmotion(top.expression);
      const score = typeof top.score === 'number' && Number.isFinite(top.score) ? top.score : 0;
      lastEmotionRef.current = { emotion: mapped, score: Math.max(0, Math.min(1, score)) };
    } catch {
      lastPresenceRef.current = false;
      lastEmotionRef.current = { emotion: 'neutral', score: 0 };
      lastDetectionScoreRef.current = 0;
    }
  }, [modelsReady]);

  const sendSnapshot = useCallback(
    async (snapshot: FaceTrackerSnapshot) => {
      if (!studentId) return;

      try {
        await fetch(`${apiBaseUrl}/api/face-data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            student_id: studentId,
            present: snapshot.present,
            attention_score: snapshot.attention_score,
            emotion: snapshot.emotion,
            emotion_score: snapshot.emotion_score,
            timestamp: snapshot.timestamp,
          }),
        });
      } catch {
        // ignore network errors
      }
    },
    [apiBaseUrl, studentId]
  );

  // Sample every N ms.
  useEffect(() => {
    if (!canRun) return;

    let timer: number | null = null;
    let stopped = false;

    const tick = async () => {
      if (stopped) return;

      await inferEmotion();

      const present = Boolean(lastPresenceRef.current);

      // Continuous attention: prefer face-api detection confidence when present.
      // If face is not present, force attention to 0.
      const rawAttention = present
        ? (modelsReady ? clamp01(lastDetectionScoreRef.current) : 1)
        : 0;

      // Smooth with a short moving average to reduce jitter.
      const attention_score = pushAndAverage(attentionHistoryRef.current, rawAttention, 5);

      const emotion = String(lastEmotionRef.current.emotion || 'neutral');
      const emotion_score = typeof lastEmotionRef.current.score === 'number' ? lastEmotionRef.current.score : 0;

      const snapshot: FaceTrackerSnapshot = {
        present,
        attention_score,
        emotion,
        emotion_score,
        timestamp: new Date().toISOString(),
      };

      onSnapshotRef.current?.(snapshot);
      void sendSnapshot(snapshot);
    };

    // send immediately, then interval
    void tick();
    timer = window.setInterval(() => {
      void tick();
    }, sendIntervalMs);

    return () => {
      stopped = true;
      if (timer !== null) window.clearInterval(timer);
    };
  }, [canRun, inferEmotion, sendIntervalMs, sendSnapshot]);

  return (
    <div className="relative">
      <video
        ref={videoRef}
        className="w-full h-auto rounded-xl bg-black"
        playsInline
        muted
        autoPlay
      />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />

      {cameraError && (
        <div className="mt-2 text-xs text-red-600 dark:text-red-400">{cameraError}</div>
      )}
      {!modelsReady && (
        <div className="mt-1 text-[11px] text-gray-600 dark:text-gray-400">
          Emotion models not loaded (place face-api models in <span className="font-mono">/public/models</span> or ensure network access for the model CDN).
        </div>
      )}
    </div>
  );
}
