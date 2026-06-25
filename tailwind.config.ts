import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Korean securities convention: up = red, down = blue
        up: "#f6465d",
        down: "#2f80ed",
        ink: {
          900: "#0b0e14",
          800: "#11151f",
          700: "#161b27",
          600: "#1e2533",
          500: "#2a3242",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
