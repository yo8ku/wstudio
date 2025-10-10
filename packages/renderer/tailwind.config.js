/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'app-bg': 'var(--app-bg)',
        'app-fg': 'var(--app-fg)',
        'titlebar-bg': 'var(--titlebar-bg)',
        'titlebar-fg': 'var(--titlebar-fg)',
      },
      keyframes: {
        "in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "out": {
          "0%": { opacity: "1" },
          "100%": { opacity: "0" },
        },
      },
      animation: {
        "in": "in 0.2s ease-out",
        "out": "out 0.2s ease-in",
      },
    },
  },
  plugins: [],
}



