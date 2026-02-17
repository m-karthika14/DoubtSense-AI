import { motion } from 'framer-motion';
import { Navigation } from '../components/Navigation';
import { AutoHelpPopup } from '../components/AutoHelpPopup';
import { Upload, FileText } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';

export function StudyView() {
  const [showHelp, setShowHelp] = useState(false);
  const [hasDocument, setHasDocument] = useState(false);
  const { setCurrentTopic, agentActive } = useApp();

  useEffect(() => {
    setCurrentTopic('Advanced Calculus');

    if (agentActive && hasDocument) {
      const timer = setTimeout(() => {
        setShowHelp(true);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [setCurrentTopic, agentActive, hasDocument]);

  const handleFileUpload = () => {
    setHasDocument(true);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gradient-to-br dark:from-slate-900 dark:to-indigo-950">
      <Navigation />

      <div className="pt-32 px-4 max-w-5xl mx-auto pb-20">
        {!hasDocument ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center min-h-[60vh]"
          >
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleFileUpload}
              className="glassmorphic rounded-3xl p-12 text-center cursor-pointer hover:shadow-2xl transition-all"
            >
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center mx-auto mb-6">
                <Upload className="w-10 h-10 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                Upload Your Study Material
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Upload documents, PDFs, or notes to begin studying
              </p>
              <div className="text-sm text-gray-500 dark:text-gray-500">
                Supports PDF, DOCX, TXT and more
              </div>
            </motion.div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
            className="glassmorphic rounded-3xl p-12"
          >
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="flex items-center gap-3 mb-8 pb-6 border-b border-gray-200 dark:border-gray-700"
            >
              <FileText className="w-6 h-6 text-violet-600" />
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Integration Techniques
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">Chapter 7 - Advanced Calculus</p>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="prose dark:prose-invert max-w-none"
            >
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                7.1 Integration by Parts
              </h3>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-6">
                Integration by parts is a technique that transforms the integral of a product of functions into other integrals.
                The formula is derived from the product rule for differentiation:
              </p>

              <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-6 my-6">
                <p className="text-center text-lg font-mono text-gray-900 dark:text-white">
                  ∫ u dv = uv − ∫ v du
                </p>
              </div>

              <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-6">
                This technique is particularly useful when the integrand is a product of two functions where one function
                becomes simpler when differentiated, and the other remains manageable when integrated.
              </p>

              <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 mt-8">
                Example Problem
              </h4>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
                Evaluate: ∫ x·e^x dx
              </p>

              <div className="bg-white dark:bg-white/5 rounded-xl p-6 space-y-4">
                <p className="text-gray-700 dark:text-gray-300">
                  <strong>Step 1:</strong> Choose u = x and dv = e^x dx
                </p>
                <p className="text-gray-700 dark:text-gray-300">
                  <strong>Step 2:</strong> Then du = dx and v = e^x
                </p>
                <p className="text-gray-700 dark:text-gray-300">
                  <strong>Step 3:</strong> Apply the formula: ∫ x·e^x dx = x·e^x − ∫ e^x dx
                </p>
                <p className="text-gray-700 dark:text-gray-300">
                  <strong>Solution:</strong> x·e^x − e^x + C = e^x(x − 1) + C
                </p>
              </div>

              <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 mt-8">
                Key Points to Remember
              </h4>
              <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300">
                <li>Choose u to be the function that simplifies when differentiated</li>
                <li>Choose dv to be the function that remains manageable when integrated</li>
                <li>The LIATE rule can help: Logarithmic, Inverse trig, Algebraic, Trigonometric, Exponential</li>
                <li>Sometimes you need to apply integration by parts multiple times</li>
              </ul>
            </motion.div>
          </motion.div>
        )}
      </div>

      <AutoHelpPopup
        isOpen={showHelp}
        onClose={() => setShowHelp(false)}
        message="I noticed you've been on this integration problem for a while. The key is to choose u = x because it simplifies when differentiated. Would you like me to walk through the steps?"
        onShowMore={() => {
          setShowHelp(false);
        }}
      />
    </div>
  );
}
