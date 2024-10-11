/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,jsx,ts,tsx}', // Include all JS/TS/JSX/TSX files in the src directory
    './pages/**/*.{js,jsx,ts,tsx}', // Also check any files in the pages directory if you have one
    './components/**/*.{js,jsx,ts,tsx}', // Include all files in components folder if applicable
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
