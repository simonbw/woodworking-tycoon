import { SoundEvent } from "./SoundEvent";

/**
 * Which clip a semantic sound cue plays, how loud, and down which bus.
 *
 * Pure lookup, shared by both shells' sound layers: the sim emits cues
 * (`SoundEvent`) that say what happened, never what it sounds like, and
 * this is the one table that decides. Keeping it here rather than in a
 * view means the old shell's `GameSoundLayer` and the engine's
 * `SoundView` can never drift apart about what an operation sounds like.
 */

/**
 * Clip per operation. Keyed by operation rather than machine so
 * tool-provided operations sound like the tool (sanding on a bench
 * sounds like sandpaper, not like a bench). Operations with no entry
 * fall back to `assembly-mallet`, which reads as generic "hand work
 * finished". An explicit `null` means silence: operations on machines
 * with a continuous voice already end with the machine unloading and
 * winding down — a completion chirp on top of that is double audio.
 */
const OPERATION_CLIP: Record<string, string | null> = {
  ripBoard: null,
  resaw: null,
  resawOnTableSaw: null,
  straightLineRip: null,
  crosscutPanel: null,
  cutBoard: null,
  jointFace: null,
  jointEdge: null,
  plane: null,
  // The saw's own voice plays the parting crack at the moment the kerf
  // completes (playSawPartCrack in handSawSynth.ts) — a generic whack
  // on top of it would be double audio, same as the machine voices.
  handSawCut: null,
  blockSandBoard: "hand-sanding",
  blockSandPanel: "hand-sanding",
  orbitSandBoard: "orbital-sander",
  orbitSandPanel: "orbital-sander",
  dismantlePallet: "pallet-dismantle",
  glueUpPanel: "glue-clamp",
  empty: "dispose-toss",
  buildRusticPalletShelf: "assembly-mallet",
  buildShelf: "assembly-mallet",
  buildJewelryBox: "assembly-mallet",
  finishCuttingBoard: "assembly-mallet",
  finishTwoToneBoard: "assembly-mallet",
  // Screwed assembly finishes with the driver, not a mallet whack
  buildPlanterBox: "drill-driver",
  buildStepStool: "drill-driver",
  buildBookshelf: "drill-driver",
};

const FALLBACK_OPERATION_CLIP = "assembly-mallet";

/** Relative level per clip. Frequent cues sit low so they don't fatigue. */
const CLIP_GAIN: Record<string, number> = {
  "hand-sanding": 0.5,
  "orbital-sander": 0.6,
  "pallet-dismantle": 0.7,
  "nail-pry": 0.7,
  "glue-clamp": 0.5,
  "assembly-mallet": 0.6,
  "drill-driver": 0.6,
  "dispose-toss": 0.6,
  "cash-register": 0.6,
  "material-pickup": 0.45,
  "material-drop": 0.45,
  "pallet-load": 0.7,
};

/**
 * Minimum gap between two plays of the same clip. Guards against
 * machine-gun audio: a sales table sells one item per tick, which at the
 * fastest speed is 20 ticks/second.
 */
export const DEFAULT_MIN_GAP_MS = 60;
const CLIP_MIN_GAP_MS: Record<string, number> = {
  "cash-register": 250,
};

/**
 * Clips that are NOT physical events in the shop: reward stingers play
 * dry, while everything else goes through the room bus and picks up the
 * shop's acoustics (see `audioBus.ts`).
 */
const NON_DIEGETIC_CLIPS = new Set([
  "cash-register",
  // Happens out on the scavenging circuit, not in the garage — the shop's
  // acoustics don't apply to a loading dock across town.
  "pallet-load",
]);

/** The clip a cue plays, or null when the cue is deliberately silent. */
export function clipFor(event: SoundEvent): string | null {
  switch (event.kind) {
    case "operation-complete": {
      if (event.operationId === undefined) return FALLBACK_OPERATION_CLIP;
      const clip = OPERATION_CLIP[event.operationId];
      // Distinguish "explicitly silent" (null) from "no entry" (undefined).
      return clip === undefined ? FALLBACK_OPERATION_CLIP : clip;
    }
    case "material-pickup":
      return "material-pickup";
    case "material-drop":
      return "material-drop";
    case "nail-pry":
      return "nail-pry";
    case "pallet-load":
      return "pallet-load";
  }
}

export function clipGain(clip: string): number {
  return CLIP_GAIN[clip] ?? 1;
}

export function clipMinGapMs(clip: string): number {
  return CLIP_MIN_GAP_MS[clip] ?? DEFAULT_MIN_GAP_MS;
}

/** Which bus a clip plays down: the room's acoustics, or dry. */
export function clipBus(clip: string): "room" | "sfx" {
  return NON_DIEGETIC_CLIPS.has(clip) ? "sfx" : "room";
}
