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
        mist: "#e8f0f3",
        tide: "#0f766e",
        glow: "#f59e0b",
        slate: "#1f2937",
      },
      boxShadow: {
        glow: "0 20px 45px -30px rgba(245, 158, 11, 0.7)",
      },
    },
  },
  plugins: [],
};
