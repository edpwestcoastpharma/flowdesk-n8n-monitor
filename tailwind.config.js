export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "Geist", "Satoshi", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      colors: {
        night: "#070B14",
        panel: "#0F172A",
        cyan: "#00C2FF",
        violet: "#7C3AED"
      },
      boxShadow: {
        glow: "0 0 60px rgba(0,194,255,0.22)",
        premium: "0 24px 80px rgba(15,23,42,0.14)"
      }
    }
  },
  plugins: []
};
