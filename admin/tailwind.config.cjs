// The console's Tailwind: the product's theme, scanning only the console's own files, so its stylesheet carries none of
// the website's classes (decision 0050).
const base = require("../tailwind.config.js");

module.exports = {
  ...base,
  content: [`${__dirname}/index.html`, `${__dirname}/src/**/*.{js,ts,jsx,tsx}`],
};
