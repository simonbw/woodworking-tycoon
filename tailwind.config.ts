import headlessPlugin from "@headlessui/tailwindcss";
import typeographyPlugin from "@tailwindcss/typography";
import { Config } from "tailwindcss";
import opentypePlugin from "tailwindcss-opentype";
import defaultTheme from "tailwindcss/defaultTheme";
import { PluginCreator } from "tailwindcss/types/config";
import { tailwindSvgStopsPlugin } from "./src/utils/tailwind-svg-stops";

const config = {
  content: ["./src/**/*.{html,js,ts,tsx}"],

  plugins: [
    opentypePlugin as PluginCreator,
    headlessPlugin,
    typeographyPlugin,
    tailwindSvgStopsPlugin,
  ],

  theme: {
    screens: {
      xs: "520px",
      ...defaultTheme.screens,
    },

    extend: {
      fontFamily: {
        // Styles
        sans: ["Nunito", ...defaultTheme.fontFamily.sans],
        serif: ["Bree Serif", ...defaultTheme.fontFamily.serif],
        body: ["Nunito", ...defaultTheme.fontFamily.sans],
        heading: ["Bree Serif", ...defaultTheme.fontFamily.serif],
        lumberjack: ["Lumberjack", ...defaultTheme.fontFamily.serif],
      },

      colors: {
        brown: {
          50: "#fdf8f6",
          100: "#f2e8e5",
          200: "#eaddd7",
          300: "#e0cec7",
          400: "#d2bab0",
          500: "#bfa094",
          600: "#a18072",
          700: "#977669",
          800: "#846358",
          900: "#43302b",
          950: "#211015",
        },
      },

      fontSize: {
        xxs: [".625rem", { lineHeight: "0.875rem", letterSpacing: "-0.02rem" }],
        md: defaultTheme.fontSize.base,
      },

      // Allow things like min-w-24
      minWidth: ({ theme }) => ({
        ...theme("spacing"),
      }),
      // Allow things like max-w-24
      maxWidth: ({ theme }) => ({
        ...theme("spacing"),
      }),
    },
  },
} satisfies Config;

export default config;
