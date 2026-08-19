const formsPlugin = require("@tailwindcss/forms");
const plugin = require("tailwindcss/plugin");

// Speckle light-theme tokens, inlined verbatim from @speckle/tailwind-theme's
// lightThemeVariables — the visual is light-only, so concrete colors replace
// the CSS-variable indirection and the preset dependency is gone entirely.
const colors = {
  foundation: {
    DEFAULT: "#FFFFFF",
    page: "#FAFAFA",
    2: "#F5F5F5",
    3: "#fcfcfc",
    4: "#fcfcfc",
    5: "#fcfcfc",
    focus: "#dbeafe",
    disabled: "#e5e5e5"
  },
  foreground: {
    DEFAULT: "#1A1A1A",
    2: "#626263",
    3: "#7C7C7D",
    "on-primary": "#fff",
    disabled: "#1A1A1A50"
  },
  primary: { DEFAULT: "#136CFF", focus: "#0057E5", muted: "#EDEDED" },
  outline: {
    1: "#276FE5",
    2: "#DFDFDF",
    3: "#E2E8F0",
    4: "#4B40C9",
    5: "#C4C4C4"
  },
  highlight: { 1: "#F4F4F4", 2: "#F2F2F2", 3: "#EDEDED" },
  success: {
    DEFAULT: "#34D399",
    lighter: "#53EDB5",
    lightest: "#EEFEF8",
    darker: "#1CBA80"
  },
  warning: {
    DEFAULT: "#FBBF24",
    lighter: "#FFD770",
    lightest: "#FEF9EE",
    darker: "#E0AB20"
  },
  info: {
    DEFAULT: "#B9B8CC",
    lighter: "#D2D1E5",
    lightest: "#EEEEFE",
    darker: "#6D6B99"
  },
  danger: {
    DEFAULT: "#C45959",
    lighter: "#F78888",
    lightest: "#FEEEEE",
    darker: "#913333"
  }
};

// the three body-text utilities the templates use (same defs as the old preset)
const speckleTypography = plugin(({ addUtilities }) => {
  addUtilities({
    ".text-body-sm": { "@apply text-sm leading-6 tracking-[-0.084px]": {} },
    ".text-body-xs": { "@apply text-[13px] leading-6 tracking-[-0.032px]": {} },
    ".text-body-2xs": { "@apply text-xs leading-4": {} }
  });
});

/** @type {import("tailwindcss").Config} */
module.exports = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,vue}"],
  theme: {
    extend: {
      colors,
      fontFamily: {
        // default system stack; Inter (weights 400-600, latin) is bundled as a
        // base64 data URI in style/visual.css — opt in with `font-inter`
        // (a remote webfont would be blocked by the PBI sandbox)
        sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol'",
        inter:
          "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        mono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"
      }
    }
  },
  plugins: [formsPlugin, speckleTypography]
};
