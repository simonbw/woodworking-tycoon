import * as fs from "node:fs";
import * as path from "node:path";
import { PNG } from "pngjs";

/**
 * Trims the transparent margin off machine sprite exports, in place.
 *
 *   npm run trim:images
 *
 * The crop is symmetric about the canvas center: the canvas center is the
 * machine's local origin — every layer is anchored at 0.5 there, moving
 * parts (the table saw's fence) are positioned by code relative to it, and
 * rotating layers (the miter saw's arm) pivot on it — so a symmetric crop
 * changes nothing about how the art renders, only how much dead canvas
 * ships. That also means exports don't need any particular canvas size:
 * draw the machine around the artboard center and export at 8 px/inch;
 * this script throws the rest away. Rerunning on an already-trimmed image
 * is a no-op.
 */

const IMAGES_DIR = path.join(__dirname, "..", "static", "images");

/**
 * Transparent pixels kept on each side of the opaque bounds, so linear
 * texture filtering never samples past the edge of the art.
 */
const PAD = 2;

/**
 * Every machine sprite layer, moving parts included (unlike the collision
 * generator's list, which measures only the static ones). All of these
 * render anchored at 0.5 — anything drawn with a different anchor must not
 * go in this list, since cropping would shift its content.
 */
const MACHINE_IMAGES = [
  "bandsaw-14-fence.png",
  "bandsaw-14-lower.png",
  "bandsaw-14-upper.png",
  "benchtop-jointer.png",
  "garbage-can.png",
  "jobsite-table-saw-fence.png",
  "jobsite-table-saw-table.png",
  "lunchbox-planer-bottom.png",
  "lunchbox-planer-screws.png",
  "lunchbox-planer-top.png",
  "makeshift-bench.png",
  "miter-saw-rotating-base.png",
  "miter-saw-stationary-base.png",
  "miter-saw-top.png",
  "operator-position.png",
];

/**
 * Bounds of every visible pixel (any alpha at all — unlike collision
 * measurement, trimming must keep soft fringes), or null if fully
 * transparent.
 */
function visibleBounds(png: PNG) {
  const { width, height, data } = png;
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return maxX === -1 ? null : { minX, maxX, minY, maxY };
}

function trimImage(file: string): string {
  const filePath = path.join(IMAGES_DIR, file);
  const png = PNG.sync.read(fs.readFileSync(filePath));
  const { width, height } = png;

  const bounds = visibleBounds(png);
  if (bounds === null) {
    return `${file}: fully transparent, left alone`;
  }

  // Largest distance from the canvas center to a visible pixel's far edge,
  // per axis — the crop keeps that much on *both* sides so the center
  // stays the center.
  const cx = width / 2;
  const cy = height / 2;
  const halfW = Math.ceil(
    Math.max(cx - bounds.minX, bounds.maxX + 1 - cx) + PAD,
  );
  const halfH = Math.ceil(
    Math.max(cy - bounds.minY, bounds.maxY + 1 - cy) + PAD,
  );
  const left = Math.max(0, Math.floor(cx - halfW));
  const top = Math.max(0, Math.floor(cy - halfH));
  const newWidth = Math.min(width, halfW * 2);
  const newHeight = Math.min(height, halfH * 2);

  if (newWidth >= width && newHeight >= height) {
    return `${file}: already tight (${width}×${height})`;
  }

  const trimmed = new PNG({ width: newWidth, height: newHeight });
  PNG.bitblt(png, trimmed, left, top, newWidth, newHeight, 0, 0);
  fs.writeFileSync(filePath, PNG.sync.write(trimmed));
  return `${file}: ${width}×${height} → ${newWidth}×${newHeight}`;
}

for (const file of MACHINE_IMAGES) {
  console.log(trimImage(file));
}
