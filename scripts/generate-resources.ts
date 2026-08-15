/**
 * Generates `src/resources/resources.ts` from the contents of `static/`.
 *
 * The vendored engine core (`src/core/`) wants string-literal name types
 * (`ImageName`, `SoundName`, `FontName`) so asset references autocomplete
 * and typo-check. The names are the URL paths the assets are served under,
 * which is also how the Pixi Assets cache keys them (see
 * `src/utils/loadAssets.ts`).
 *
 * Run `npm run generate:resources` after adding or removing files in
 * `static/images/`, `static/sounds/`, or `static/fonts/`. The generated
 * file is committed.
 */
import fs from "fs";
import path from "path";

const ROOT = path.join(__dirname, "..");
const STATIC_DIR = path.join(ROOT, "static");
const OUT_FILE = path.join(ROOT, "src", "resources", "resources.ts");

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walk(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

/** URL paths (sorted for stable output) for files under static/<sub> with the given extensions. */
function urlPaths(sub: string, extensions: string[]): string[] {
  return walk(path.join(STATIC_DIR, sub))
    .filter((f) => extensions.includes(path.extname(f).toLowerCase()))
    .map((f) => "/" + path.relative(STATIC_DIR, f).split(path.sep).join("/"))
    .sort();
}

const images = urlPaths("images", [".png", ".jpg", ".webp", ".svg"]);
const sounds = urlPaths("sounds", [".ogg", ".flac", ".mp3", ".wav"]);
const fonts = urlPaths("fonts", [".woff2", ".woff", ".ttf"]);

function nameList(label: string, names: string[]): string {
  const items = names.map((n) => `  "${n}",`).join("\n");
  return `export const ${label} = [\n${items}\n] as const;\n`;
}

const source = `// GENERATED FILE — do not edit by hand.
// Regenerate with \`npm run generate:resources\` after changing static/ assets.

${nameList("IMAGE_NAMES", images)}
export type ImageName = (typeof IMAGE_NAMES)[number];

${nameList("SOUND_NAMES", sounds)}
export type SoundName = (typeof SOUND_NAMES)[number];

${nameList("FONT_NAMES", fonts)}
export type FontName = (typeof FONT_NAMES)[number];
`;

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, source);
console.log(
  `Wrote ${path.relative(ROOT, OUT_FILE)}: ${images.length} images, ${sounds.length} sounds, ${fonts.length} fonts`,
);
