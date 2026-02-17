import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Brain } from 'lucide-react';
import { Button } from '../components/Button';

export function IntroPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center gradient-bg relative overflow-hidden">
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 0.3, scale: 1 }}
        transition={{ duration: 3, repeat: Infinity, repeatType: 'reverse' }}
        className="absolute inset-0 bg-gradient-to-br from-indigo-500/20 via-violet-500/20 to-purple-500/20 blur-3xl"
      />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className="text-center z-10 px-4"
      >
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ duration: 0.8, delay: 0.2, type: 'spring' }}
          className="inline-flex items-center justify-center w-24 h-24 rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-600 mb-8 shadow-2xl"
        >
          <Brain className="w-12 h-12 text-white" />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="text-6xl md:text-7xl font-bold mb-6 gradient-text"
        >
          DoubtSense AI
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="text-xl md:text-2xl text-gray-700 dark:text-gray-300 mb-12 max-w-2xl mx-auto font-light"
        >
          Resolve doubts without asking
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="flex flex-col sm:flex-row gap-4 justify-center items-center"
        >
          <Button variant="primary" onClick={() => navigate('/login')}>
            Login
          </Button>
          <Button variant="secondary" onClick={() => navigate('/dashboard')}>
            Try as Guest
          </Button>
        </motion.div>
      </motion.div>
    </div>
  );
}
