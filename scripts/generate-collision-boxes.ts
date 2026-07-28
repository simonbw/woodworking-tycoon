import * as fs from "node:fs";
import * as path from "node:path";
import { PNG } from "pngjs";

/**
 * Measures each machine's visible footprint from its sprite art and writes
 * src/game/machine-collision-boxes.generated.ts — the collision boxes the
 * player's body bumps into (see docs/continuous-movement.md).
 *
 *   npm run generate:collision-boxes
 *
 * The geometry mirrors how MachineSprite renders: every layer is anchored
 * at 0.5 on the origin cell's center, drawn at 8 image pixels per inch
 * (times an optional per-layer scale), and a cell is 12 inches — so one
 * cell is 96 image pixels and the mapping from opaque-pixel bounds to
 * cell units is pure arithmetic. Machines drawn procedurally (garbage can,
 * worktables) have nothing to measure; their boxes are hand-set in their
 * defs, which always win over this file.
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

/**
 * A row/column needs a full inch of solid pixels to extend the box, so a
 * stray wisp of anti-aliasing can't inflate it.
 */
const MIN_SOLID_RUN = 8;

interface LayerSpec {
  readonly file: string;
  /** Extra sprite scale on top of IMAGE_SCALE (the table saw draws at 0.8). */
  readonly scale?: number;
}

interface MachineSpec {
  readonly layers: ReadonlyArray<LayerSpec>;
  /**
   * Where the sprite mounts its art, in cells out from the origin cell's
   * center. Machines with an odd footprint draw on the origin cell and
   * leave this alone; an even one (the band saw's 2×2) has its art
   * centered half a cell along each axis instead.
   */
  readonly artOffset?: readonly [number, number];
}

/**
 * The static layers of each image-based machine, matching what its sprite
 * component actually mounts. Moving parts that ride the machine (the table
 * saw's sliding fence, the band saw's) are left out — the collision box is
 * the part that never moves.
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
    artOffset: [0.5, 0.5],
  },
  workspace: { layers: [{ file: "makeshift-bench.png" }] },
};

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * The opaque bounding box of one layer, in cell units relative to the
 * image center, or null for a fully transparent image.
 */
function measureLayer({ file, scale = 1 }: LayerSpec): Box | null {
  const png = PNG.sync.read(fs.readFileSync(path.join(IMAGES_DIR, file)));
  const { width, height, data } = png;

  const solidPerColumn = new Array<number>(width).fill(0);
  const solidPerRow = new Array<number>(height).fill(0);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] >= ALPHA_THRESHOLD) {
        solidPerColumn[x]++;
        solidPerRow[y]++;
      }
    }
  }

  const first = (counts: number[]) =>
    counts.findIndex((count) => count >= MIN_SOLID_RUN);
  const last = (counts: number[]) =>
    counts.length - 1 - first([...counts].reverse());
  if (first(solidPerColumn) === -1 || first(solidPerRow) === -1) {
    return null;
  }

  const pixelsToCells = scale / IMAGE_PIXELS_PER_CELL;
  return {
    minX: (first(solidPerColumn) - width / 2) * pixelsToCells,
    maxX: (last(solidPerColumn) + 1 - width / 2) * pixelsToCells,
    minY: (first(solidPerRow) - height / 2) * pixelsToCells,
    maxY: (last(solidPerRow) + 1 - height / 2) * pixelsToCells,
  };
}

function unionBoxes(boxes: Box[]): Box {
  return {
    minX: Math.min(...boxes.map((box) => box.minX)),
    minY: Math.min(...boxes.map((box) => box.minY)),
    maxX: Math.max(...boxes.map((box) => box.maxX)),
    maxY: Math.max(...boxes.map((box) => box.maxY)),
  };
}

const round = (n: number) => Math.round(n * 1000) / 1000;

const entries = Object.entries(MACHINES).map(([machine, spec]) => {
  const measured = spec.layers
    .map((layer) => measureLayer(layer))
    .filter((box): box is Box => box !== null);
  if (measured.length === 0) {
    throw new Error(`No solid pixels found in any layer of ${machine}`);
  }
  const [offsetX, offsetY] = spec.artOffset ?? [0, 0];
  const measuredBox = unionBoxes(measured);
  const box = {
    minX: measuredBox.minX + offsetX,
    maxX: measuredBox.maxX + offsetX,
    minY: measuredBox.minY + offsetY,
    maxY: measuredBox.maxY + offsetY,
  };
  const line =
    `  ${machine}: { min: [${round(box.minX)}, ${round(box.minY)}], ` +
    `max: [${round(box.maxX)}, ${round(box.maxY)}] },`;
  console.log(line.trim());
  return line;
});

fs.writeFileSync(
  OUT_FILE,
  `// GENERATED FILE — do not edit by hand.
// Measured from the machine sprite images by scripts/generate-collision-boxes.ts;
// re-run \`npm run generate:collision-boxes\` after changing machine art.
import type { CollisionBox } from "./Machine";

/**
 * Collision boxes measured from sprite art: the opaque bounding box of each
 * image-based machine's static layers, in cell units relative to its origin
 * cell's center.
 */
export const GENERATED_COLLISION_BOXES = {
${entries.join("\n")}
} satisfies Record<string, CollisionBox>;
`,
);
console.log(`\nWrote ${path.relative(process.cwd(), OUT_FILE)}`);
