/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts}'],
  theme: {
    extend: {
      colors: {
        bg: '#0d0f12',
        surface: '#141720',
        surface2: '#1c2030',
        border: '#252a3a',
        accent: '#4fffb0',
        accent2: '#7c6fff',
        wa: '#25d366',
        ink: '#e8eaf0',
        muted: '#6b7494',
        danger: '#ff5f5f',
        warn: '#ffb84d',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'status-pulse': 'status-pulse 2s infinite',
      },
      keyframes: {
        'status-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
      },
    },
  },
  plugins: [],
}
