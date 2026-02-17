import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

interface ConfidenceRingProps {
  value: number;
}

export function ConfidenceRing({ value }: ConfidenceRingProps) {
  const [displayValue, setDisplayValue] = useState(0);
  const circumference = 2 * Math.PI * 90;
  const strokeDashoffset = circumference - (displayValue / 100) * circumference;

  useEffect(() => {
    const timer = setTimeout(() => {
      setDisplayValue(value);
    }, 300);
    return () => clearTimeout(timer);
  }, [value]);

  return (
    <div className="relative w-64 h-64">
      <svg className="w-full h-full transform -rotate-90">
        <circle
          cx="128"
          cy="128"
          r="90"
          stroke="currentColor"
          strokeWidth="12"
          fill="none"
          className="text-gray-200 dark:text-gray-700"
        />
        <motion.circle
          cx="128"
          cy="128"
          r="90"
          stroke="url(#gradient)"
          strokeWidth="12"
          fill="none"
          strokeLinecap="round"
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1.5, ease: 'easeOut' }}
          style={{
            strokeDasharray: circumference,
          }}
        />
        <defs>
          <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="50%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
        </defs>
      </svg>
      <motion.div
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, delay: 0.3 }}
        className="absolute inset-0 flex flex-col items-center justify-center"
      >
        <motion.span
          key={displayValue}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-5xl font-bold gradient-text"
        >
          {Math.round(displayValue)}%
        </motion.span>
        <span className="text-sm text-gray-600 dark:text-gray-400 mt-2">Overall Confidence</span>
      </motion.div>
    </div>
  );
}
