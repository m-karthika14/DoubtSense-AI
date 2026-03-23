import { ReactNode } from 'react';
import { HTMLMotionProps, motion } from 'framer-motion';

interface ButtonProps extends HTMLMotionProps<'button'> {
  variant?: 'primary' | 'secondary' | 'ghost';
  children: ReactNode;
}

export function Button({ variant = 'primary', children, className = '', ...props }: ButtonProps) {
  const baseClasses = 'px-6 py-3 rounded-xl font-medium transition-all duration-300 relative overflow-hidden';

  const variantClasses = {
    primary: 'bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 text-white hover:shadow-2xl hover:shadow-violet-500/50 hover:scale-105',
    secondary: 'glassmorphic text-gray-900 dark:text-white hover:scale-105',
    ghost: 'text-gray-700 dark:text-gray-300 hover:bg-white/10',
  };

  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
      {...props}
    >
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="relative z-10"
      >
        {children}
      </motion.span>
    </motion.button>
  );
}
