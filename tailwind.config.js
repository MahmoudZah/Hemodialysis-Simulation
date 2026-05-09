/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'med-bg': '#0b1220',
        'med-panel': '#111a2e',
        'med-accent': '#22d3ee',
        'med-good': '#10b981',
        'med-warn': '#f59e0b',
        'med-crit': '#ef4444',
      },
      keyframes: {
        'alarm-pulse': {
          '0%, 100%': { backgroundColor: 'rgba(239, 68, 68, 0.20)' },
          '50%': { backgroundColor: 'rgba(239, 68, 68, 0.55)' },
        },
      },
      animation: {
        'alarm-pulse': 'alarm-pulse 0.9s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
