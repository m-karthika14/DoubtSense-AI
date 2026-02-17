import { motion } from 'framer-motion';
import { Navigation } from '../components/Navigation';
import { Card } from '../components/Card';
import { Toggle } from '../components/Toggle';
import { Button } from '../components/Button';
import { Moon, Sun, Bell, Video, Brain, Mail } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';

export function SettingsPage() {
  const { setCurrentTopic, agentActive, cameraActive, toggleAgent, toggleCamera } = useApp();
  const { isDark, toggleTheme } = useTheme();
  const [emailNotifications, setEmailNotifications] = useState(true);

  useEffect(() => {
    setCurrentTopic('Settings');
  }, [setCurrentTopic]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gradient-to-br dark:from-slate-900 dark:to-indigo-950 pb-20">
      <Navigation />

      <div className="pt-32 px-4 max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            Settings
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-8">
            Customize your learning experience
          </p>
        </motion.div>

        <div className="space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <Card>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-3">
                <Brain className="w-6 h-6 text-violet-600" />
                AI Assistant
              </h3>

              <div className="space-y-6">
                <div className="flex items-center justify-between pb-6 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex-1">
                    <div className="font-medium text-gray-900 dark:text-white mb-1">
                      Enable AI Agent
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      Get automatic help when you're struggling with concepts
                    </div>
                  </div>
                  <Toggle enabled={agentActive} onChange={toggleAgent} />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="font-medium text-gray-900 dark:text-white mb-1">
                      AI Sensitivity
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      How quickly the AI should offer help
                    </div>
                  </div>
                  <select className="px-4 py-2 rounded-xl glassmorphic text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500">
                    <option>Low</option>
                    <option selected>Medium</option>
                    <option>High</option>
                  </select>
                </div>
              </div>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <Card>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-3">
                <Video className="w-6 h-6 text-teal-600" />
                Camera & Privacy
              </h3>

              <div className="space-y-6">
                <div className="flex items-center justify-between pb-6 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex-1">
                    <div className="font-medium text-gray-900 dark:text-white mb-1">
                      Enable Camera
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      Allow the AI to analyze your engagement and expressions
                    </div>
                  </div>
                  <Toggle enabled={cameraActive} onChange={toggleCamera} />
                </div>

                <div className="p-4 rounded-xl bg-teal-50 dark:bg-teal-900/20">
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    Camera data is processed locally and never stored. It helps the AI detect when you might need assistance.
                  </p>
                </div>
              </div>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <Card>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-3">
                <Bell className="w-6 h-6 text-amber-600" />
                Notifications
              </h3>

              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="font-medium text-gray-900 dark:text-white mb-1 flex items-center gap-2">
                      <Mail className="w-5 h-5" />
                      Email Notifications
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      Receive weekly progress reports and study reminders
                    </div>
                  </div>
                  <Toggle enabled={emailNotifications} onChange={() => setEmailNotifications(!emailNotifications)} />
                </div>
              </div>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <Card>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-3">
                {isDark ? <Moon className="w-6 h-6 text-indigo-600" /> : <Sun className="w-6 h-6 text-amber-600" />}
                Appearance
              </h3>

              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="font-medium text-gray-900 dark:text-white mb-1">
                    Dark Mode
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Switch between light and dark themes
                  </div>
                </div>
                <Toggle enabled={isDark} onChange={toggleTheme} />
              </div>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="flex justify-center"
          >
            <Button variant="primary">
              Save Changes
            </Button>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
