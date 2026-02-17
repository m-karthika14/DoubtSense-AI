import { motion } from 'framer-motion';
import { useState } from 'react';

interface DataPoint {
  date: string;
  value: number;
}

interface ProgressGraphProps {
  data: DataPoint[];
}

export function ProgressGraph({ data }: ProgressGraphProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const maxValue = Math.max(...data.map(d => d.value));
  const width = 600;
  const height = 200;
  const padding = 20;

  const points = data.map((point, i) => {
    const x = padding + (i / (data.length - 1)) * (width - 2 * padding);
    const y = height - padding - (point.value / maxValue) * (height - 2 * padding);
    return { x, y, ...point };
  });

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
        <defs>
          <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="50%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
        </defs>

        <motion.path
          d={pathD}
          fill="none"
          stroke="url(#lineGradient)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 2, ease: 'easeOut' }}
        />

        {points.map((point, i) => (
          <motion.circle
            key={i}
            cx={point.x}
            cy={point.y}
            r={hoveredIndex === i ? 6 : 4}
            fill="#8b5cf6"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.3, delay: i * 0.1 }}
            onMouseEnter={() => setHoveredIndex(i)}
            onMouseLeave={() => setHoveredIndex(null)}
            className="cursor-pointer"
          />
        ))}
      </svg>

      {hoveredIndex !== null && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute glassmorphic px-3 py-2 rounded-lg text-sm pointer-events-none"
          style={{
            left: `${(hoveredIndex / (data.length - 1)) * 100}%`,
            top: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        >
          <div className="font-semibold">{points[hoveredIndex].value}%</div>
          <div className="text-xs text-gray-600 dark:text-gray-400">{points[hoveredIndex].date}</div>
        </motion.div>
      )}
    </div>
  );
}
