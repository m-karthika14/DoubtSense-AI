import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useApp } from '../context/AppContext';
import { FaceTracker, FaceTrackerSnapshot } from './FaceTracker';

type Props = {
  enabled: boolean;
};

export function FaceTrackingPopup({ enabled }: Props) {
  const { user, guest } = useApp();
  const [snapshot, setSnapshot] = useState<FaceTrackerSnapshot>({
    present: false,
    attention_score: 0,
    emotion: 'neutral',
    emotion_score: 0,
    timestamp: new Date().toISOString(),
  });

  const API = useMemo(() => {
    return (import.meta.env.VITE_API_URL as string) || 'http://localhost:4000';
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (user?.userId) return;

    // Ensure a student id exists (guest user) so the backend can store events.
    let cancelled = false;
    (async () => {
      try {
        await guest();
      } catch {
        // ignore
      }
      if (cancelled) return;
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, guest, user?.userId]);

  const studentId = user?.userId;

  if (!enabled) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed bottom-5 right-5 z-50 w-[360px] max-w-[90vw]"
    >
      <div className="rounded-2xl bg-white/8 dark:bg-black/30 backdrop-blur-md border border-white/10 dark:border-white/5 shadow-sm p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold text-black dark:text-white">Face Tracking</div>
          <div className="text-[11px] text-gray-700 dark:text-gray-300">
            {snapshot.present ? 'Face Detected' : 'Not Detected'}
          </div>
        </div>

        <div className="text-xs text-gray-700 dark:text-gray-300 mb-3 space-y-1">
          <div>Emotion: <span className="font-semibold">{snapshot.emotion}</span> ({snapshot.emotion_score.toFixed(2)})</div>
          <div>Attention: <span className="font-semibold">{snapshot.attention_score}</span></div>
        </div>

        <FaceTracker
          enabled={enabled}
          apiBaseUrl={API}
          studentId={studentId}
          onSnapshot={setSnapshot}
          sendIntervalMs={2000}
        />

        {!studentId && (
          <div className="mt-2 text-[11px] text-gray-600 dark:text-gray-400">
            Creating a guest session…
          </div>
        )}
      </div>
    </motion.div>
  );
}
