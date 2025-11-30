import plugin from "tailwindcss/plugin";
import { objectEntries } from "./arrayUtils";

type Color = string | { [key: string]: Color };
export const tailwindSvgStopsPlugin = plugin(
  ({ matchUtilities, theme, e }) => {
    const stopValues: [string, string][] = [];
    const colorEntries: [string, Color][] = objectEntries(
      theme("colors") as Record<string, Color>,
    );
    while (colorEntries.length > 0) {
      const [colorName, colorValue] = colorEntries.pop()!;
      if (typeof colorValue === "string") {
        stopValues.push([colorName, colorValue]);
      } else if (typeof colorValue === "object") {
        for (const [subColorName, subColorValue] of objectEntries(colorValue)) {
          colorEntries.push([`${colorName}-${subColorName}`, subColorValue]);
        }
      }
    }

    matchUtilities(
      {
        stop: (value) => ({
          "stop-color": value,
        }),
      },
      {
        values: Object.fromEntries(stopValues),
        type: "color",
      },
    );
  },
  { theme: {} },
);
