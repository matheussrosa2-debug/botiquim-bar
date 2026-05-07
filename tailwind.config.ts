/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        btq: {
          red:        "#C41E1E",
          "red-dark": "#A01818",
          "red-light":"#F5E8E8",
          gold:       "#C9A84C",
          "gold-dark":"#A88830",
          "gold-light":"#FDF6E3",
          dark:       "#1A1A1A",
          cream:      "#FAFAF7",
          border:     "#E8E2D9",
        },
        brand: {
          50:  "#FFF7ED",
          100: "#FFEDD5",
          500: "#F97316",
          600: "#EA580C",
          700: "#C2410C",
          900: "#7C2D12",
        },
      },
      fontFamily: {
        sans:    ["Lato", "system-ui", "sans-serif"],
        display: ["Playfair Display", "Georgia", "serif"],
        mono:    ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
};
