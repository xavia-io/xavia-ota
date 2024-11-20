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
        background: '#F7F8FA',
        primary: {
          100: '#DDDDF7',
          200: '#BBBBEF',
          300: '#9A99E7',
          400: '#7877DF',
          500: '#5655D7', // Primary color
        },
      },
    },
  },
  plugins: [],
};
