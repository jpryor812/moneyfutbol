/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Pitch-themed palette
        pitch: {
          900: '#0a1f14', // deepest turf / app bg
          800: '#0e2a1b',
          700: '#13402a',
          600: '#1a5638',
          500: '#22c55e', // bright grass accent
          400: '#4ade80',
          line: '#1f5f3f', // pitch markings
        },
        chalk: '#f4f7f5', // white lines / text
        buy: '#22c55e',
        fade: '#ef4444',
        fair: '#9ca3af',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      backgroundImage: {
        'pitch-stripes':
          'repeating-linear-gradient(90deg, rgba(255,255,255,0.015) 0px, rgba(255,255,255,0.015) 60px, transparent 60px, transparent 120px)',
      },
    },
  },
  plugins: [],
}
