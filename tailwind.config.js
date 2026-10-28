/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',

    // Or if using `src` directory:
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#0B0B0D',
        panel: '#141416',
        line: '#26262A',
        muted: '#9A9AA0',
        primary: {
          100: '#FFD9DB',
          200: '#FFB0B4',
          300: '#FF8B8F',
          400: '#E0414D',
          500: '#C81E2C', // Primary color
          600: '#A5121F',
        },
      },
    },
  },
  plugins: [],
};
