// Stops PostCSS from walking up to the app's postcss.config.js, whose Tailwind build breaks the
// stylesheet LikeC4 ships with its viewer (`@layer base` without `@tailwind base`).
module.exports = { plugins: [] };
