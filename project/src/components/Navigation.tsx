import { motion } from 'framer-motion';
import { Brain, Camera, User } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { Toggle } from './Toggle';
import { useApp } from '../context/AppContext';

export function Navigation() {
  const { agentActive, cameraActive, toggleAgent, toggleCamera } = useApp();

  return (
    <nav className="fixed top-6 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-4xl">
      <div className="rounded-2xl px-6 py-3 flex items-center justify-between bg-white/8 dark:bg-black/30 backdrop-blur-md border border-white/10 dark:border-white/5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center">
            <Brain className="w-6 h-6 text-white" />
          </div>
          <span className="font-bold text-lg text-black dark:text-white">DoubtSense AI</span>
        </div>

        <div className="hidden md:flex items-center gap-6">
          <NavLink to="/dashboard" className="text-sm font-medium text-black dark:text-white/90">
            Home
          </NavLink>
          <NavLink to="/insights" className="text-sm font-medium text-black dark:text-white/90">
            Insights
          </NavLink>
          <NavLink to="/study" className="text-sm font-medium text-black dark:text-white/90">
            Study
          </NavLink>
          <NavLink to="/settings" className="text-sm font-medium text-black dark:text-white/90">
            Settings
          </NavLink>
        </div>

        
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Brain className={`w-5 h-5 ${agentActive ? 'text-violet-600 pulse-glow' : 'text-gray-400'}`} />
            <Toggle enabled={agentActive} onChange={toggleAgent} label="Agent" />
          </div>

          <div className="relative group">
            <Camera className={`w-5 h-5 ${cameraActive ? 'text-teal-500' : 'text-gray-400'} cursor-pointer`} onClick={toggleCamera} />
            {cameraActive && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -bottom-1 -right-1 w-2 h-2 bg-teal-500 rounded-full pulse-glow"
              />
            )}
            <div className="absolute top-8 right-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              <div className="px-3 py-2 rounded-lg text-xs whitespace-nowrap bg-black/60 text-white">
                Camera {cameraActive ? 'ON' : 'OFF'}
              </div>
            </div>
          </div>

          <motion.div
            whileHover={{ scale: 1.1 }}
            className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-violet-400 flex items-center justify-center cursor-pointer"
          >
            <User className="w-5 h-5 text-white" />
          </motion.div>
        </div>
      </div>
    </nav>
  );
}
