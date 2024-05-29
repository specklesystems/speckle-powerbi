const speckleTheme = require("@speckle/tailwind-theme");
const themeConfig = require("@speckle/tailwind-theme/tailwind-configure");
const uiConfig = require("@speckle/ui-components/tailwind-configure");
const formsPlugin = require("@tailwindcss/forms");

/** @type {import("tailwindcss").Config} */
module.exports = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,vue}", themeConfig.tailwindContentEntry(require), uiConfig.tailwindContentEntry(require)],
  plugins: [speckleTheme.default, formsPlugin]
};
