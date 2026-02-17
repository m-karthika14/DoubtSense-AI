import { motion } from 'framer-motion';

interface ToggleProps {
  enabled: boolean;
  onChange: () => void;
  label?: string;
}

export function Toggle({ enabled, onChange, label }: ToggleProps) {
  return (
    <button
      onClick={onChange}
      className="flex items-center gap-3 group"
    >
      {label && <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>}
      <div
        className={`relative w-12 h-7 rounded-full transition-colors duration-300 ${
          enabled ? 'bg-gradient-to-r from-indigo-600 to-violet-600' : 'bg-gray-300 dark:bg-gray-600'
        }`}
      >
        <motion.div
          animate={{ x: enabled ? 22 : 2 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          className="absolute top-1 w-5 h-5 bg-white rounded-full shadow-lg"
        />
      </div>
    </button>
  );
}
