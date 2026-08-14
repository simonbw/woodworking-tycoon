/**
 * Downloads every web font the UI asks for into `static/fonts/` and writes
 * the matching `@font-face` rules to `src/styles/fonts.generated.css`.
 *
 * The shop serves its own type. Nothing in the app may reference a font CDN
 * at runtime: a third-party stylesheet is a render-blocking request to a
 * host we don't control, it leaks every player's IP to that host, and a
 * blocked or slow CDN costs the boot gate its three-second timeout and
 * shows fallback text. Fetching happens here, once, at author time.
 *
 * Run `npm run fetch:fonts` after changing FAMILIES, then commit both the
 * new `.woff2` files and the regenerated CSS.
 *
 * Keep FAMILIES in step with the `fontFamily` block in `tailwind.config.ts`
 * and the face list in `src/utils/loadFonts.ts` — those two decide which
 * families and weights the UI can actually ask for.
 */
import fsp from "fs/promises";
import path from "path";

/**
 * The families to vendor, with every weight the UI uses. Adding a weight
 * here is not enough on its own — `loadFonts.ts` has to warm it too, or it
 * arrives late and re-lays out the text under it.
 */
const FAMILIES = [
  { name: "Barlow Condensed", weights: [400, 500, 600, 700] },
  { name: "Andada Pro", weights: [400, 500, 600, 700] },
  { name: "Stardos Stencil", weights: [400, 700] },
] as const;

/**
 * Only the latin subset ships. Google splits each face into subsets by
 * unicode-range, and latin is the only one the game's copy lands in — the
 * arrows, box-drawing glyphs and stars scattered through the UI sit
 * outside every subset Google offers and fall back to a system face
 * regardless (which is exactly why the reputation star is an SVG).
 */
const SUBSET = "latin";

/** Google hands back `woff2` only if it believes the client can take it. */
const CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const FONT_DIR = "static/fonts";
const OUT_CSS = "src/styles/fonts.generated.css";

interface Face {
  readonly family: string;
  readonly weight: number;
  readonly url: string;
  readonly unicodeRange: string;
}

/**
 * Pull the CSS for one family and keep only the faces in our subset.
 *
 * Google labels each block with a `/* subset *\/` comment on the line
 * above it, so the subset a face belongs to is only knowable from the
 * comment — there is nothing inside the rule itself that names it.
 */
async function fetchFaces(family: string, weights: readonly number[]) {
  const spec = `${family.replace(/ /g, "+")}:wght@${weights.join(";")}`;
  const url = `https://fonts.googleapis.com/css2?family=${spec}&display=swap`;
  const res = await fetch(url, { headers: { "User-Agent": CHROME_UA } });
  if (!res.ok) {
    throw new Error(`${family}: ${res.status} ${res.statusText}`);
  }
  const css = await res.text();

  const faces: Face[] = [];
  const blocks = css.matchAll(
    /\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g,
  );
  for (const [, subset, body] of blocks) {
    if (subset !== SUBSET) continue;
    const weight = Number(body.match(/font-weight:\s*(\d+)/)?.[1]);
    const src = body.match(/url\((https:[^)]+\.woff2)\)/)?.[1];
    const unicodeRange = body.match(/unicode-range:\s*([^;]+);/)?.[1]?.trim();
    if (!weight || !src || !unicodeRange) {
      throw new Error(`${family}: could not read a ${subset} face`);
    }
    faces.push({ family, weight, url: src, unicodeRange });
  }

  // A silently-missing weight would fall back at runtime and look like a
  // styling bug months later, so treat it as a build failure now.
  const got = new Set(faces.map((f) => f.weight));
  const missing = weights.filter((w) => !got.has(w));
  if (missing.length > 0) {
    throw new Error(`${family}: no ${SUBSET} face for weight ${missing}`);
  }
  return faces;
}

/**
 * One shipped file, and the weights it covers.
 *
 * A variable family answers every requested weight with the *same* URL, so
 * the weights collapse onto one file and the rule gets a `font-weight`
 * range. Saving that file once per weight instead would ship the same
 * bytes three or four times over and make the browser fetch each copy
 * separately — they're different URLs, so nothing is shared.
 */
interface Asset {
  readonly family: string;
  readonly weights: number[];
  readonly url: string;
  readonly unicodeRange: string;
}

/** `barlow-condensed-600.woff2`, or `andada-pro-variable.woff2` for a range. */
function fileNameFor(asset: Asset) {
  const slug = asset.family.toLowerCase().replace(/\s+/g, "-");
  const suffix =
    asset.weights.length > 1 ? "variable" : String(asset.weights[0]);
  return `${slug}-${suffix}.woff2`;
}

/** `font-weight: 400` for a static face, `400 700` for a variable one. */
function weightRuleFor(asset: Asset) {
  if (asset.weights.length === 1) return String(asset.weights[0]);
  return `${Math.min(...asset.weights)} ${Math.max(...asset.weights)}`;
}

/** Collapse faces that resolved to the same file into one asset each. */
function toAssets(faces: readonly Face[]) {
  const byUrl = new Map<string, Asset>();
  for (const face of faces) {
    const existing = byUrl.get(face.url);
    if (existing) {
      existing.weights.push(face.weight);
    } else {
      byUrl.set(face.url, {
        family: face.family,
        weights: [face.weight],
        url: face.url,
        unicodeRange: face.unicodeRange,
      });
    }
  }
  return [...byUrl.values()];
}

async function main() {
  await fsp.mkdir(FONT_DIR, { recursive: true });

  const faces: Face[] = [];
  for (const { name, weights } of FAMILIES) {
    console.log(`fetching ${name} (${weights.join(", ")})`);
    faces.push(...(await fetchFaces(name, weights)));
  }

  const assets = toAssets(faces);
  for (const asset of assets) {
    const res = await fetch(asset.url, {
      headers: { "User-Agent": CHROME_UA },
    });
    if (!res.ok) throw new Error(`${asset.url}: ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    const file = path.join(FONT_DIR, fileNameFor(asset));
    await fsp.writeFile(file, bytes);
    const covers = weightRuleFor(asset);
    console.log(
      `  ${file} (${(bytes.length / 1024).toFixed(1)} KB, ${covers})`,
    );
  }

  const rules = assets.map((asset) =>
    [
      `@font-face {`,
      `  font-family: "${asset.family}";`,
      `  font-style: normal;`,
      `  font-weight: ${weightRuleFor(asset)};`,
      `  font-display: swap;`,
      `  src: url("/fonts/${fileNameFor(asset)}") format("woff2");`,
      `  unicode-range: ${asset.unicodeRange};`,
      `}`,
    ].join("\n"),
  );

  const header = [
    `/* Generated by \`npm run fetch:fonts\` — do not edit by hand.`,
    ` *`,
    ` * The ${SUBSET} subset of every web family the UI uses, served from our`,
    ` * own origin. Faces of our own making (Lumberjack, Shantell Notes) live`,
    ` * in fonts.css instead. See scripts/fetch-fonts.ts. */`,
  ].join("\n");

  await fsp.writeFile(OUT_CSS, `${header}\n\n${rules.join("\n\n")}\n`);
  console.log(`\nwrote ${OUT_CSS} (${assets.length} faces)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
