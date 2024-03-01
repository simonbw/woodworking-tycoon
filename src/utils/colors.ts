import resolveConfig from "tailwindcss/resolveConfig";
import myTailwindConfig from "../../tailwind.config.js";

const fullConfig = resolveConfig(myTailwindConfig);

export const colors = fullConfig.theme.colors;
