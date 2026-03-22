/**
 * Tailwind config for the starter plugin webview.
 * Scans the React source and static panel entry for utility usage.
 */

module.exports = {
  content: [
    './webview-src/**/*.{ts,tsx}',
    './webviews/panel.html',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
