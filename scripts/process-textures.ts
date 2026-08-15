/**
 * Cuts the game-ready texture files in static/images/textures out of the
 * source photography in assets/textures/materials — resize and JPEG
 * recompression, driven by the manifest below. The manifest is the
 * single record of which source serves which in-game texture; the
 * registries in src/components/material-sprites/ point at the outputs.
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
  /** File name under assets/textures/materials. */
  readonly source: string;
  /** File name under static/images/textures. Always JPEG — every
   * texture is an opaque photo, and JPEG is a fraction of PNG's size. */
  readonly out: string;
  /** Cap on the longest edge, in pixels; omit to ship the source size. */
  readonly maxSize?: number;
  /** JPEG quality, 0–100. */
  readonly quality?: number;
}

/** One full-board scan per file; shipped at source size — boards get
 * looked at closely on the bench, and the scans are narrow enough that
 * the pixels are cheap. */
const OAK_BOARDS: ReadonlyArray<Job> = Array.from({ length: 13 }, (_, i) => ({
  source: `board-oak-${i + 1}.jpg`,
  out: `board-oak-${i + 1}.jpg`,
}));

/** Full-length edge strips, straight tight grain. */
const OAK_EDGES: ReadonlyArray<Job> = Array.from({ length: 3 }, (_, i) => ({
  source: `board-edge-oak-${i + 1}.jpg`,
  out: `board-edge-oak-${i + 1}.jpg`,
}));

/** Grayscale wear maps at board proportions — white is clean wood, dark
 * is scuffed and saw-marked. Species-independent: they multiply over
 * whatever face is under them. */
const ROUGHNESS: ReadonlyArray<Job> = Array.from({ length: 5 }, (_, i) => ({
  source: `board-roughness-${i + 1}.png`,
  out: `board-roughness-${i + 1}.jpg`,
  // Wear doesn't need the grain's resolution
  maxSize: 2048,
}));

const MANIFEST: ReadonlyArray<Job> = [
  // Sheet-good faces (SHEET_FACE_TEXTURES) — seamless square tiles
  { source: "face-birch-1.jpg", out: "sheet-plywood-birch.jpg", maxSize: 2048 },
  {
    source: "plywood-shop-grade-2.png",
    out: "sheet-plywood-fir.jpg",
    maxSize: 2048,
  },
  {
    source: "plywood-shop-grade-1.png",
    out: "sheet-plywood-fir-knotty.jpg",
    maxSize: 2048,
  },
  { source: "osb-1.png", out: "sheet-osb.jpg", maxSize: 1024 },
  { source: "mdf-1.png", out: "sheet-mdf.jpg", maxSize: 1024 },
  { source: "melamine-1.png", out: "sheet-melamine.jpg", maxSize: 1024 },
  // Board faces and edges (BOARD_FACE_TEXTURES) — full-board scans
  ...OAK_BOARDS,
  ...OAK_EDGES,
  // Wear maps (BOARD_ROUGHNESS_TEXTURES)
  ...ROUGHNESS,
];

fs.mkdirSync(OUT_DIR, { recursive: true });

for (const job of MANIFEST) {
  const sourcePath = path.join(SOURCE_DIR, job.source);
  const outPath = path.join(OUT_DIR, job.out);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing source: ${sourcePath}`);
  }
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
  execFileSync("sips", [...args, sourcePath, "--out", outPath], {
    stdio: ["ignore", "ignore", "inherit"],
  });
  const kb = Math.round(fs.statSync(outPath).size / 1024);
  console.log(`${job.source} -> ${outPath} (${kb}KB)`);
}
