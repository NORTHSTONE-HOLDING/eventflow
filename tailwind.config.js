/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        gold: {
          DEFAULT: '#D4AF37',
          50: '#FBF6E4',
          100: '#F5EAC0',
          200: '#EAD684',
          300: '#E0C24C',
          400: '#D4AF37',
          500: '#B7942A',
          600: '#94761F',
          700: '#6F5817',
          800: '#4C3C10',
          900: '#2B2209',
        },
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        sans: ['Outfit', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        gold: '0 0 24px rgba(212, 175, 55, 0.28)',
        glow: '0 0 40px rgba(96, 165, 250, 0.25)',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseRed: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(239, 68, 68, 0.6)' },
          '50%': { boxShadow: '0 0 0 12px rgba(239, 68, 68, 0)' },
        },
      },
      animation: {
        fadeUp: 'fadeUp 0.4s ease both',
        pulseRed: 'pulseRed 1.1s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
