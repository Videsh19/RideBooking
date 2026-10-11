/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          purple: {
            DEFAULT: '#8B5CF6',
            light: '#7C3AED',
            hoverDark: '#7C3AED',
            hoverLight: '#6D28D9',
          },
          dark: {
            bg: '#0B0A0F',
            card: '#17141E',
            input: '#100E16',
            border: '#30283A',
            text: '#FFFFFF',
            textSecondary: '#A9A3B2',
          },
          light: {
            bg: '#F7F5FC',
            card: '#FFFFFF',
            surface: '#EEEAF7',
            input: '#FFFFFF',
            border: '#E4DFEC',
            text: '#17131F',
            textSecondary: '#6B6475',
          },
        },
        theme: {
          bg: 'var(--bg-main)',
          card: 'var(--bg-card)',
          surface: 'var(--bg-surface)',
          input: 'var(--bg-input)',
          border: 'var(--border-main)',
          primary: 'var(--primary-main)',
          'primary-hover': 'var(--primary-hover)',
          text: 'var(--text-main)',
          'text-secondary': 'var(--text-secondary)',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};
