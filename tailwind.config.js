/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        colegio: {
          navy: '#002855',
          navyLight: '#073B73',
          gold: '#D4AF37',
          goldDark: '#B89020',
          goldLight: '#E5C05B',
          accent: '#EEB902',
        }
      },
      fontFamily: {
        sans: ['Outfit', 'Inter', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
