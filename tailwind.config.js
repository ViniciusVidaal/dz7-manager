/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["'Space Grotesk'", "system-ui", "sans-serif"],
        body: ["'Plus Jakarta Sans'", "system-ui", "sans-serif"],
      },
      colors: {
        ink: "#0b1015",
        mist: "#ebf8fc",
        tide: "#19b6e0",
        glow: "#74d8f2",
        slate: "#1f2937",
      },
      boxShadow: {
        glow: "0 20px 45px -30px rgba(25, 182, 224, 0.65)",
      },
    },
  },
  plugins: [],
};
