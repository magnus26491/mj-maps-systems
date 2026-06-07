import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#f0fafa',
          100: '#d0f0f0',
          200: '#a0e0e0',
          300: '#60c8c8',
          400: '#30aaaa',
          500: '#01696f',  // primary teal
          600: '#0c4e54',
          700: '#0f3638',
          800: '#0a2426',
          900: '#051314',
        },
        surface: {
          50:  '#f7f6f2',
          100: '#1c1b19',
          200: '#201f1d',
          300: '#28271f',
          400: '#2d2c2a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'pulse-fast': 'pulse 1s cubic-bezier(0.4,0,0.6,1) infinite',
        'slide-in': 'slideIn 0.2s ease-out',
        'fade-in': 'fadeIn 0.15s ease-out',
      },
      keyframes: {
        slideIn: {
          '0%': { transform: 'translateX(16px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
