/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: 'rgb(var(--color-primary))',
          light: 'rgba(var(--color-primary), 0.1)',
        },
        accent: {
          DEFAULT: 'rgb(var(--color-accent))',
          light: 'rgba(var(--color-accent), 0.1)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'draw-line': 'draw-line 2s ease-out forwards',
        'count-up': 'count-up 0.6s ease-out forwards',
      },
    },
  },
  plugins: [],
};
