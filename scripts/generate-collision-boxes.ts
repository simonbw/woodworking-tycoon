import * as fs from "node:fs";
import * as path from "node:path";
import { PNG } from "pngjs";
import { MACHINE_TYPES, MachineId, footprintCenter } from "../src/game/Machine";

/**
 * Measures each machine's visible silhouette from its sprite art and
 * writes src/game/machine-collision-boxes.generated.ts — the collision
 * shapes the player's body bumps into (see game/player-motion.ts).
 *
 *   npm run generate:collision-boxes
 *
 * One bounding box per machine turned concave silhouettes into fat
 * invisible walls (a jointer's narrow beds cast a full-width block), so
 * each machine is instead covered by a handful of boxes: the silhouette
 * is rasterized onto a subcell grid and greedily covered with maximal
 * all-solid rectangles until nearly all of it is claimed. Thin fringes
 * the cover leaves out are anti-aliasing and soft shadows — brushing
 * through those reads better than bumping into air.
 *
 * The geometry mirrors how MachineSprite renders: every layer is anchored
 * at 0.5 on the machine's footprint center (FootprintArt), drawn at 8
 * image pixels per inch (times an optional per-layer scale), and a cell is
 * 12 inches — so one cell is 96 image pixels and the mapping from opaque
 * pixels to cell units is pure arithmetic plus the footprint offset.
 * Layers that translate with machine settings (sliding fences) are left
 * out — a solid can't follow them around. Machines drawn procedurally
 * (garbage can, worktables) have nothing to measure; their shapes are
 * hand-set in their defs, which always win over this file.
 */

const IMAGES_DIR = path.join(__dirname, "..", "static", "images");
const OUT_FILE = path.join(
  __dirname,
  "..",
  "src",
  "game",
  "machine-collision-boxes.generated.ts",
);

/** 8 image pixels per inch × 12 inches per cell. */
const IMAGE_PIXELS_PER_CELL = 96;

/** A pixel this opaque counts as solid — fringes and soft shadows don't. */
const ALPHA_THRESHOLD = 128;

/** Silhouette raster resolution: subcells per cell (one inch each). */
const GRID = 12;

/**
 * A subcell needs this fraction of its area in solid pixels to count.
 * Keeps anti-aliased fringes from inflating the silhouette while still
 * catching thin rails and legs.
 */
const SUBCELL_SOLID_FRACTION = 0.15;

/** Stop covering once this fraction of the silhouette is claimed. */
const COVER_TARGET = 0.97;

/** Never emit more than this many boxes per machine. */
const MAX_BOXES = 5;

/** Don't bother with a box smaller than this fraction of the silhouette. */
const MIN_BOX_FRACTION = 0.02;

interface LayerSpec {
  readonly file: string;
  /** Extra sprite scale on top of IMAGE_SCALE (the table saw draws at 0.8). */
  readonly scale?: number;
}

interface MachineSpec {
  readonly layers: ReadonlyArray<LayerSpec>;
}

/**
 * The static layers of each image-based machine, matching what its sprite
 * component actually mounts. Moving parts that ride the machine (the
 * saws' sliding fences) are left out — they draw wherever the machine's
 * settings put them, so no fixed solid can be honest about them.
 */
const MACHINES: Record<string, MachineSpec> = {
  lunchboxPlaner: {
    layers: [
      { file: "lunchbox-planer-bottom.png" },
      { file: "lunchbox-planer-top.png" },
      { file: "lunchbox-planer-screws.png" },
    ],
  },
  jointer: { layers: [{ file: "benchtop-jointer.png" }] },
  miterSaw: {
    layers: [
      { file: "miter-saw-stationary-base.png" },
      { file: "miter-saw-rotating-base.png" },
      { file: "miter-saw-top.png" },
    ],
  },
  jobsiteTableSaw: {
    layers: [{ file: "jobsite-table-saw-table.png", scale: 0.8 }],
  },
  bandSaw: {
    layers: [
      { file: "bandsaw-14-lower.png" },
      { file: "bandsaw-14-upper.png" },
    ],
  },
  workspace: { layers: [{ file: "makeshift-bench.png" }] },
};

/**
 * The union silhouette of a machine's layers as a subcell mask. The mask
 * origin is anchored so subcell boundaries land on whole GRID fractions
 * of the image center — box edges then convert exactly.
 */
interface Silhouette {
  /** Solid-area accumulator per subcell, in cell² units. */
  readonly solid: boolean[][];
  /** Cell coordinates of the mask's [0, 0] subcell corner, image-centered. */
  readonly origin: [number, number];
  readonly width: number;
  readonly height: number;
}

function measureSilhouette(layers: ReadonlyArray<LayerSpec>): Silhouette {
  // Coverage accumulates in cell² per subcell; a pixel's area depends on
  // its layer's scale, so blend layers by area rather than pixel count.
  const coverage = new Map<string, number>();
  let minGX = Infinity;
  let maxGX = -Infinity;
  let minGY = Infinity;
  let maxGY = -Infinity;

  for (const { file, scale = 1 } of layers) {
    const png = PNG.sync.read(fs.readFileSync(path.join(IMAGES_DIR, file)));
    const { width, height, data } = png;
    const pixelsToCells = scale / IMAGE_PIXELS_PER_CELL;
    const pixelArea = pixelsToCells * pixelsToCells;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] < ALPHA_THRESHOLD) continue;
        const cellX = (x + 0.5 - width / 2) * pixelsToCells;
        const cellY = (y + 0.5 - height / 2) * pixelsToCells;
        const gx = Math.floor(cellX * GRID);
        const gy = Math.floor(cellY * GRID);
        const key = `${gx},${gy}`;
        coverage.set(key, (coverage.get(key) ?? 0) + pixelArea);
        if (gx < minGX) minGX = gx;
        if (gx > maxGX) maxGX = gx;
        if (gy < minGY) minGY = gy;
        if (gy > maxGY) maxGY = gy;
      }
    }
  }
  if (!Number.isFinite(minGX)) {
    throw new Error("No solid pixels found in any layer");
  }

  const width = maxGX - minGX + 1;
  const height = maxGY - minGY + 1;
  const subcellArea = (1 / GRID) ** 2;
  const solid = Array.from({ length: height }, (_, gy) =>
    Array.from({ length: width }, (_, gx) => {
      const filled = coverage.get(`${gx + minGX},${gy + minGY}`) ?? 0;
      return filled >= SUBCELL_SOLID_FRACTION * subcellArea;
    }),
  );
  return { solid, origin: [minGX / GRID, minGY / GRID], width, height };
}

interface GridRect {
  x0: number;
  y0: number;
  x1: number; // exclusive
  y1: number; // exclusive
}

/**
 * The largest axis-aligned rectangle of `true` cells in the mask
 * (classic largest-rectangle-in-histogram sweep), or null if the mask
 * is empty.
 */
function largestRectangle(mask: boolean[][]): GridRect | null {
  const height = mask.length;
  const width = height > 0 ? mask[0].length : 0;
  const columnRun = new Array<number>(width).fill(0);
  let best: GridRect | null = null;
  let bestArea = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      columnRun[x] = mask[y][x] ? columnRun[x] + 1 : 0;
    }
    // Largest rectangle in this row's histogram, stack of rising runs.
    const stack: number[] = [];
    for (let x = 0; x <= width; x++) {
      const run = x < width ? columnRun[x] : 0;
      while (stack.length > 0 && columnRun[stack[stack.length - 1]] >= run) {
        const topRun = columnRun[stack.pop()!];
        const left = stack.length > 0 ? stack[stack.length - 1] + 1 : 0;
        const area = topRun * (x - left);
        if (area > bestArea) {
          bestArea = area;
          best = { x0: left, y0: y - topRun + 1, x1: x, y1: y + 1 };
        }
      }
      stack.push(x);
    }
  }
  return best;
}

/**
 * Greedy rectangle cover: repeatedly claim the largest all-solid,
 * still-uncovered rectangle until COVER_TARGET of the silhouette is
 * covered (or the box budget runs out). Returns rects in grid units and
 * the fraction covered.
 */
function coverSilhouette(silhouette: Silhouette): {
  rects: GridRect[];
  coverage: number;
} {
  const uncovered = silhouette.solid.map((row) => [...row]);
  const total = uncovered.flat().filter(Boolean).length;
  let remaining = total;
  const rects: GridRect[] = [];
  while (remaining > (1 - COVER_TARGET) * total && rects.length < MAX_BOXES) {
    const rect = largestRectangle(uncovered);
    if (rect === null) break;
    const area = (rect.x1 - rect.x0) * (rect.y1 - rect.y0);
    if (area < MIN_BOX_FRACTION * total) break;
    rects.push(rect);
    for (let y = rect.y0; y < rect.y1; y++) {
      for (let x = rect.x0; x < rect.x1; x++) {
        if (uncovered[y][x]) {
          uncovered[y][x] = false;
          remaining--;
        }
      }
    }
  }
  return { rects, coverage: 1 - remaining / total };
}

const round = (n: number) => Math.round(n * 1000) / 1000;

const entries = Object.entries(MACHINES).map(([machine, spec]) => {
  const silhouette = measureSilhouette(spec.layers);
  const { rects, coverage } = coverSilhouette(silhouette);
  // Art mounts on the footprint center (FootprintArt in MachineSprite)
  const [offsetX, offsetY] = footprintCenter(
    MACHINE_TYPES[machine as MachineId].cellsOccupied,
  );
  const [originX, originY] = silhouette.origin;
  const boxes = rects.map((rect) => ({
    minX: round(originX + rect.x0 / GRID + offsetX),
    minY: round(originY + rect.y0 / GRID + offsetY),
    maxX: round(originX + rect.x1 / GRID + offsetX),
    maxY: round(originY + rect.y1 / GRID + offsetY),
  }));
  console.log(
    `${machine}: ${boxes.length} boxes cover ${(coverage * 100).toFixed(1)}%` +
      ` of the silhouette`,
  );
  const shapeLines = boxes.map(
    (b) =>
      `    { kind: "box", min: [${b.minX}, ${b.minY}], ` +
      `max: [${b.maxX}, ${b.maxY}] },`,
  );
  return `  ${machine}: [\n${shapeLines.join("\n")}\n  ],`;
});

fs.writeFileSync(
  OUT_FILE,
  `// GENERATED FILE — do not edit by hand.
// Measured from the machine sprite images by scripts/generate-collision-boxes.ts;
// re-run \`npm run generate:collision-boxes\` after changing machine art.
import type { CollisionShape } from "./Machine";

/**
 * Collision shapes measured from sprite art: a greedy rectangle cover of
 * each image-based machine's static-layer silhouette, in cell units
 * relative to its origin cell's center.
 */
export const GENERATED_COLLISION_SHAPES = {
${entries.join("\n")}
} satisfies Record<string, ReadonlyArray<CollisionShape>>;
`,
);
console.log(`\nWrote ${path.relative(process.cwd(), OUT_FILE)}`);
