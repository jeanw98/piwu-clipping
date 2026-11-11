/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#07080a',
          900: '#0c0f14',
          800: '#141821',
          700: '#1c2230',
          600: '#2a3344',
        },
        accent: {
          DEFAULT: '#e8ff47',
          muted: '#b6c93a',
        },
        mist: '#a8b0bf',
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        sans: ['"IBM Plex Sans"', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 40px rgba(232, 255, 71, 0.12)',
      },
      backgroundImage: {
        grain:
          'radial-gradient(circle at 20% 20%, rgba(232,255,71,0.08), transparent 35%), radial-gradient(circle at 80% 0%, rgba(80,120,255,0.08), transparent 40%), linear-gradient(160deg, #07080a 0%, #0c0f14 45%, #12161f 100%)',
      },
    },
  },
  plugins: [],
};
