import type { Config } from "npm:tailwindcss@3.4.3/types/config";
import daisyui from "npm:daisyui@4.11.1";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {}
  },
  plugins: [daisyui],
  daisyui: {
    themes: ["light", "dark"]
  }
} satisfies Config;
