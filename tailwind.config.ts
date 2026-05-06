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
        // Workshop UI typography (paperwork direction)
        condensed: ["Barlow Condensed", ...defaultTheme.fontFamily.sans],
        stencil: ["Stardos Stencil", ...defaultTheme.fontFamily.serif],
        typewriter: ["Special Elite", "Courier New", "monospace"],
        ink: ["Caveat", "cursive"],
        mono: ["JetBrains Mono", ...defaultTheme.fontFamily.mono],

        // Legacy / logo-only
        sans: ["Nunito", ...defaultTheme.fontFamily.sans],
        serif: ["Bree Serif", ...defaultTheme.fontFamily.serif],
        body: ["Nunito", ...defaultTheme.fontFamily.sans],
        heading: ["Bree Serif", ...defaultTheme.fontFamily.serif],
        lumberjack: ["Lumberjack", ...defaultTheme.fontFamily.serif],
      },

      colors: {
        // Ink colors for text and stamps
        ink: {
          black: "#1a1a1a",
          fade: "#5a5550",
          red: "#a62d2d",
          blue: "#1f3a6e",
          brown: "#5c3d2e",
        },

        // Paper tones for cards
        paper: {
          manila: "#e6d5a8",
          "manila-edge": "#c9b783",
          ivory: "#f5f0e2",
          cream: "#ebe4d2",
          legal: "#e8d99c",
        },

        // Corkboard / pinboard
        corkboard: {
          DEFAULT: "#9a7c54",
          dark: "#6e5638",
        },

        // Dark workshop chrome (the surface around the paper)
        workshop: {
          bg: "#1f1c18",
          panel: "#2a2520",
          edge: "#3a342c",
        },

        // Single warm accent for money / progress / highlights
        gold: {
          DEFAULT: "#c9a55c",
          light: "#e0bd75",
          dark: "#9c7e3f",
        },

        // Big-box store palette (StorePage only)
        store: {
          orange: "#f47820",
          "orange-dark": "#cf5d10",
          concrete: "#d4d4d2",
          "concrete-dark": "#aaaaa6",
          tag: "#1a1a1a",
        },

        // Legacy brown palette retained for sprites/older components.
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
