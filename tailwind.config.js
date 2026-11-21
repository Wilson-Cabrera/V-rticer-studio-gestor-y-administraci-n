/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      colors: {
        vorticer: {
          bg: '#111827',
          surface: '#1F2A37',
          floating: '#374151',
          primary: '#7BCBFF',
          secondary: '#6A5CFF',
          text: '#F7F9FC',
          muted: '#94A3B8',
        }
      },
      backgroundImage: {
        'vorticer-gradient': 'linear-gradient(135deg, #6A5CFF 0%, #7BCBFF 100%)',
      }
    },
  },
  plugins: [],
}
