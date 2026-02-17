import { motion } from 'framer-motion';
import { Navigation } from '../components/Navigation';
import { Card } from '../components/Card';
import { ProgressGraph } from '../components/ProgressGraph';
import { TrendingUp, Clock, Brain, Zap } from 'lucide-react';
import { useEffect } from 'react';
import { useApp } from '../context/AppContext';

const confidenceTimeline = [
  { date: 'Week 1', value: 45 },
  { date: 'Week 2', value: 48 },
  { date: 'Week 3', value: 55 },
  { date: 'Week 4', value: 58 },
  { date: 'Week 5', value: 65 },
  { date: 'Week 6', value: 70 },
  { date: 'Week 7', value: 72 },
];

const studySessions = [
  { date: '2024-02-10', duration: '45m', topic: 'Calculus', confidence: 65 },
  { date: '2024-02-11', duration: '60m', topic: 'Physics', confidence: 70 },
  { date: '2024-02-12', duration: '30m', topic: 'Chemistry', confidence: 55 },
  { date: '2024-02-13', duration: '50m', topic: 'Calculus', confidence: 72 },
  { date: '2024-02-14', duration: '40m', topic: 'Linear Algebra', confidence: 68 },
];

const helpUsage = [
  { time: '10:30 AM', topic: 'Integration by Parts', type: 'Auto-suggested' },
  { time: '2:15 PM', topic: 'Quantum States', type: 'Auto-suggested' },
  { time: '4:45 PM', topic: 'Chemical Bonds', type: 'Auto-suggested' },
];

export function InsightsPage() {
  const { setCurrentTopic } = useApp();

  useEffect(() => {
    setCurrentTopic('Insights');
  }, [setCurrentTopic]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gradient-to-br dark:from-slate-900 dark:to-indigo-950 pb-20">
      <Navigation />

      <div className="pt-32 px-4 max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            Your Learning Insights
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-8">
            Track your progress and understand your learning patterns
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
          {[
            { icon: TrendingUp, label: 'Growth This Week', value: '+12%', color: 'from-green-500 to-emerald-500' },
            { icon: Clock, label: 'Total Study Time', value: '24h', color: 'from-blue-500 to-cyan-500' },
            { icon: Brain, label: 'Topics Mastered', value: '8', color: 'from-violet-500 to-purple-500' },
            { icon: Zap, label: 'Streak Days', value: '15', color: 'from-orange-500 to-amber-500' },
          ].map((stat, index) => {
            const Icon = stat.icon;
            return (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 * index }}
              >
                <Card className="flex items-center gap-4">
                  <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${stat.color} flex items-center justify-center flex-shrink-0`}>
                    <Icon className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">{stat.label}</div>
                    <div className="text-3xl font-bold text-gray-900 dark:text-white">{stat.value}</div>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mb-8"
        >
          <Card>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
              Confidence Timeline
            </h3>
            <ProgressGraph data={confidenceTimeline} />
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-4">
              Your overall confidence has increased by 27% over the past 7 weeks
            </p>
          </Card>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <Card>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
                Recent Study Sessions
              </h3>
              <div className="space-y-4">
                {studySessions.map((session, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.4, delay: 0.1 * index }}
                    className="flex items-center justify-between p-4 rounded-xl bg-white/50 dark:bg-white/5"
                  >
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white">{session.topic}</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">{session.date}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium text-gray-900 dark:text-white">{session.duration}</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">{session.confidence}% confident</div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <Card>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
                AI Help Usage
              </h3>
              <div className="space-y-4">
                {helpUsage.map((help, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.4, delay: 0.1 * index }}
                    className="flex items-start gap-3 p-4 rounded-xl bg-white/50 dark:bg-white/5"
                  >
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center flex-shrink-0">
                      <Brain className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-gray-900 dark:text-white">{help.topic}</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">{help.time}</div>
                      <div className="text-xs text-violet-600 dark:text-violet-400 mt-1">{help.type}</div>
                    </div>
                  </motion.div>
                ))}
              </div>
              <div className="mt-6 p-4 rounded-xl bg-indigo-50 dark:bg-indigo-900/20">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  The AI helped you 3 times today, saving an estimated 45 minutes of confusion.
                </p>
              </div>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
