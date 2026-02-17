import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Navigation } from '../components/Navigation';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { ConfidenceRing } from '../components/ConfidenceRing';
import { ProgressGraph } from '../components/ProgressGraph';
import { BookOpen, TrendingUp, Clock, Target } from 'lucide-react';
import { useEffect } from 'react';
import { useApp } from '../context/AppContext';

const weakTopics = [
  { name: 'Calculus Integration', confidence: 45, trend: 'improving' },
  { name: 'Quantum Mechanics', confidence: 52, trend: 'stable' },
  { name: 'Organic Chemistry', confidence: 38, trend: 'weak' },
  { name: 'Linear Algebra', confidence: 61, trend: 'improving' },
];

const progressData = [
  { date: 'Mon', value: 45 },
  { date: 'Tue', value: 52 },
  { date: 'Wed', value: 58 },
  { date: 'Thu', value: 55 },
  { date: 'Fri', value: 65 },
  { date: 'Sat', value: 70 },
  { date: 'Sun', value: 72 },
];

const behaviorMetrics = [
  { icon: BookOpen, label: 'Study Hours', value: '24h', color: 'from-blue-500 to-cyan-500' },
  { icon: TrendingUp, label: 'Growth Rate', value: '+12%', color: 'from-green-500 to-emerald-500' },
  { icon: Clock, label: 'Avg Session', value: '45m', color: 'from-violet-500 to-purple-500' },
  { icon: Target, label: 'Goals Met', value: '8/10', color: 'from-orange-500 to-amber-500' },
];

export function Dashboard() {
  const navigate = useNavigate();
  const { setCurrentTopic } = useApp();

  useEffect(() => {
    setCurrentTopic('Dashboard');
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
            Welcome back!
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-8">
            Here's your learning progress overview
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <Card className="flex flex-col items-center justify-center py-8">
              <ConfidenceRing value={72} />
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="lg:col-span-2"
          >
            <Card>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                7-Day Progress
              </h3>
              <ProgressGraph data={progressData} />
            </Card>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="lg:col-span-2"
          >
            <Card>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                  Topics Needing Attention
                </h3>
                <Button variant="ghost" onClick={() => navigate('/study')}>
                  Start Study
                </Button>
              </div>

              <div className="space-y-4">
                {weakTopics.map((topic, index) => (
                  <motion.div
                    key={topic.name}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.4, delay: 0.1 * index }}
                    className="flex items-center gap-4 p-4 rounded-xl bg-white/50 dark:bg-white/5 hover:bg-white/80 dark:hover:bg-white/10 transition-all cursor-pointer"
                    onClick={() => {
                      setCurrentTopic(topic.name);
                      navigate('/study');
                    }}
                  >
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-gray-900 dark:text-white">{topic.name}</span>
                        <span className="text-sm text-gray-600 dark:text-gray-400">{topic.confidence}%</span>
                      </div>
                      <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${topic.confidence}%` }}
                          transition={{ duration: 1, delay: 0.2 * index }}
                          className={`h-full ${
                            topic.trend === 'improving' ? 'bg-green-500' :
                            topic.trend === 'stable' ? 'bg-blue-400' :
                            'bg-amber-500'
                          }`}
                        />
                      </div>
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
                Behavior Snapshot
              </h3>
              <div className="space-y-4">
                {behaviorMetrics.map((metric, index) => {
                  const Icon = metric.icon;
                  return (
                    <motion.div
                      key={metric.label}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.3, delay: 0.1 * index }}
                      whileHover={{ scale: 1.05 }}
                      className="flex items-center gap-4 p-4 rounded-xl bg-white/50 dark:bg-white/5"
                    >
                      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${metric.color} flex items-center justify-center`}>
                        <Icon className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="text-sm text-gray-600 dark:text-gray-400">{metric.label}</div>
                        <div className="text-2xl font-bold text-gray-900 dark:text-white">{metric.value}</div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </Card>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="flex gap-4 justify-center"
        >
          <Button variant="primary" onClick={() => navigate('/study')}>
            Continue Learning
          </Button>
          <Button variant="secondary" onClick={() => navigate('/insights')}>
            View Insights
          </Button>
        </motion.div>
      </div>
    </div>
  );
}
