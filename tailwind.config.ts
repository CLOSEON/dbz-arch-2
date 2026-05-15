import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'sans-serif'],
      },
      colors: {
        brand: {
          DEFAULT: '#FF6B35', // Primary Orange
          50:  '#FFF0EA',
          100: '#FFE2D5',
          500: '#FF6B35',
          600: '#E65A2A',
          700: '#CC4A1F',
          secondary: '#2D3142', // Secondary Dark Blue/Grey
        },
        ivory: {
          DEFAULT: '#FFF3EE', // Light Peachy Background
          dark: '#FDECE4',
        },
        yellow: {
          pale: '#FFEDD5',
          soft: '#FEF3C7',
        },
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        card: '0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.04)',
        'card-hover': '0 4px 16px 0 rgb(0 0 0 / 0.08)',
      },
      animation: {
        'fade-in': 'fadeIn 0.15s ease-out both',
        'fade-up': 'fadeInUp 0.2s ease-out both',
        shimmer: 'shimmer 1.5s infinite linear',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        fadeInUp: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
