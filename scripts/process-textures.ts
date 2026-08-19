/**
 * Cuts the game-ready texture files in static/images/textures out of the
 * source photography in assets/textures/materials — resize and JPEG
 * recompression, driven by the manifest below. The manifest is the
 * single record of which source serves which in-game texture; the
 * registries in src/components/material-sprites/ point at the outputs.
 *
 * Both trees are foldered by material — one folder per species, one for
 * sheet goods of every kind, and `shared` for the overlays that aren't
 * tied to a material. Source files keep the names they were exported
 * under; outputs are named for their folder (oak/face-1.jpg).
 *
 * Run with `npm run process:textures` after adding or changing an entry.
 * Uses macOS `sips`, like the machine-art exports this project is drawn
 * on. Outputs are committed, so a run on an unchanged manifest is a
 * no-op diff apart from JPEG encoder drift.
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const SOURCE_DIR = "assets/textures/materials";
const OUT_DIR = "static/images/textures";

interface Job {
  /** Path under assets/textures/materials, material folder included. */
  readonly source: string;
  /** Path under static/images/textures, material folder included. Always
   * JPEG — every texture is an opaque photo, and JPEG is a fraction of
   * PNG's size. */
  readonly out: string;
  /** Cap on the longest edge, in pixels; omit to ship the source size. */
  readonly maxSize?: number;
  /** JPEG quality, 0–100. */
  readonly quality?: number;
  /** Degrees to rotate clockwise, for sources exported sideways — the
   * game wants every board scan portrait, grain running down. */
  readonly rotate?: number;
}

/**
 * One full-board scan per file, shipped at source size — boards get
 * looked at closely on the bench, and the scans are narrow enough that
 * the pixels are cheap. Sources are `<species>-board-N`; oak predates
 * the cut-sheet exports and keeps its photo scans' extension.
 */
const boardScans = (
  species: string,
  count: number,
  ext = "png",
  extra: Partial<Job> = {},
): ReadonlyArray<Job> =>
  Array.from({ length: count }, (_, i) => ({
    source: `${species}/${species}-board-${i + 1}.${ext}`,
    out: `${species}/face-${i + 1}.jpg`,
    ...extra,
  }));

const ALL_BOARDS: ReadonlyArray<Job> = [
  ...boardScans("pallet", 9),
  ...boardScans("pine", 21),
  // The first four poplar scans were exported sideways
  ...boardScans("poplar", 10).map((job, i) =>
    i < 4 ? { ...job, rotate: 90 } : job,
  ),
  ...boardScans("oak", 13, "jpg"),
  ...boardScans("maple", 10),
  ...boardScans("cherry", 12),
  ...boardScans("walnut", 5),
  ...boardScans("mahogany", 11),
  ...boardScans("purpleheart", 11),
];

/** Full-length edge strips, straight tight grain — oak only so far. */
const OAK_EDGES: ReadonlyArray<Job> = Array.from({ length: 3 }, (_, i) => ({
  source: `oak/oak-edge-${i + 1}.jpg`,
  out: `oak/edge-${i + 1}.jpg`,
}));

/** Crosscut ends: growth rings on the sawn face, one crop per file.
 * Small already — a cap only trims the few oversized ones. */
const endScans = (species: string, count: number): ReadonlyArray<Job> =>
  Array.from({ length: count }, (_, i) => ({
    source: `${species}/${species}-end-${i + 1}.png`,
    out: `${species}/end-${i + 1}.jpg`,
    maxSize: 1024,
  }));

const ALL_ENDS: ReadonlyArray<Job> = [
  ...endScans("pallet", 4),
  ...endScans("pine", 4),
  ...endScans("poplar", 4),
  ...endScans("oak", 4),
  ...endScans("maple", 4),
  ...endScans("cherry", 4),
  ...endScans("walnut", 8),
  ...endScans("mahogany", 4),
  ...endScans("purpleheart", 4),
];

/** Grayscale wear maps at board proportions — white is clean wood, dark
 * is scuffed and saw-marked. Species-independent: they multiply over
 * whatever face is under them. */
const ROUGHNESS: ReadonlyArray<Job> = Array.from({ length: 5 }, (_, i) => ({
  source: `shared/board-roughness-${i + 1}.png`,
  out: `shared/roughness-${i + 1}.jpg`,
  // Wear doesn't need the grain's resolution
  maxSize: 2048,
}));

const MANIFEST: ReadonlyArray<Job> = [
  // Sheet-good faces (SHEET_FACE_TEXTURES) — seamless square tiles
  {
    source: "sheet-goods/plywood-birch-1.jpg",
    out: "sheet-goods/plywood-birch.jpg",
    maxSize: 2048,
  },
  {
    source: "sheet-goods/plywood-shop-grade-2.png",
    out: "sheet-goods/plywood-fir.jpg",
    maxSize: 2048,
  },
  {
    source: "sheet-goods/plywood-shop-grade-1.png",
    out: "sheet-goods/plywood-fir-knotty.jpg",
    maxSize: 2048,
  },
  {
    source: "sheet-goods/osb-1.png",
    out: "sheet-goods/osb.jpg",
    maxSize: 1024,
  },
  {
    source: "sheet-goods/mdf-1.png",
    out: "sheet-goods/mdf.jpg",
    maxSize: 1024,
  },
  {
    source: "sheet-goods/melamine-1.png",
    out: "sheet-goods/melamine.jpg",
    maxSize: 1024,
  },
  // Board faces and edges (BOARD_FACE_TEXTURES) — full-board scans
  ...ALL_BOARDS,
  ...OAK_EDGES,
  // Crosscut ends (BOARD_FACE_TEXTURES[species].ends)
  ...ALL_ENDS,
  // Wear maps (BOARD_ROUGHNESS_TEXTURES)
  ...ROUGHNESS,
];

for (const job of MANIFEST) {
  const sourcePath = path.join(SOURCE_DIR, job.source);
  const outPath = path.join(OUT_DIR, job.out);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing source: ${sourcePath}`);
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const args = [
    "-s",
    "format",
    "jpeg",
    "-s",
    "formatOptions",
    String(job.quality ?? 82),
  ];
  if (job.maxSize !== undefined) {
    args.push("-Z", String(job.maxSize));
  }
  if (job.rotate !== undefined) {
    args.push("-r", String(job.rotate));
  }
  execFileSync("sips", [...args, sourcePath, "--out", outPath], {
    stdio: ["ignore", "ignore", "inherit"],
  });
  const kb = Math.round(fs.statSync(outPath).size / 1024);
  console.log(`${job.source} -> ${outPath} (${kb}KB)`);
}
