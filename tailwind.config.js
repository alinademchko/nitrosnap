/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#B8FFF2',
          100: '#9AF2E3',
          200: '#053F35',
          300: 'rgba(5,63,53,.08)'
        },
        case: '#3730a3',
        casebg: '#eef2ff',
        text:   '#111827',
        withnitro: '#059669',
        withoutnitro: '#dc2626',
      }
    },
  },
  plugins: [],
}

