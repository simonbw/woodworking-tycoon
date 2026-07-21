import React, { useEffect } from "react";
import { clearPendingSoundsAction } from "../game/game-actions/sound-actions";
import { SoundEvent } from "../game/SoundEvent";
import { playSound } from "../utils/sfx";
import { useApplyGameAction, useGameState } from "./useGameState";

/**
 * The game-event → sound bridge. Pure actions can't (and shouldn't) touch the
 * DOM or Web Audio, so instead they queue semantic cues onto
 * `gameState.pendingSounds`. This headless component drains that queue each
 * render: it plays the mapped clip for each cue, then clears the queue.
 *
 * Mounted once inside the GameStateProvider (see `Main.tsx`).
 */

/**
 * Clip per operation. Keyed by operation rather than machine so tool-provided
 * operations sound like the tool (sanding on a bench sounds like sandpaper,
 * not like a bench). Operations with no entry fall back to `assembly-mallet`,
 * which reads as generic "hand work finished". An explicit `null` means
 * silence: operations on machines with a continuous voice
 * (`MachineSoundLayer`) already end with the machine unloading and winding
 * down — a completion chirp on top of that is double audio.
 */
const OPERATION_CLIP: Record<string, string | null> = {
  ripBoard: null,
  straightLineRip: null,
  crosscutPanel: null,
  cutBoard: null,
  jointFace: null,
  jointEdge: null,
  planeBoard: null,
  planePanel: null,
  blockSandBoard: "hand-sanding",
  blockSandPanel: "hand-sanding",
  orbitSandBoard: "orbital-sander",
  orbitSandPanel: "orbital-sander",
  dismantlePallet: "pallet-dismantle",
  glueUpPanel: "glue-clamp",
  dispose: "dispose-toss",
  buildRusticPalletShelf: "assembly-mallet",
  buildShelf: "assembly-mallet",
  buildJewelryBox: "assembly-mallet",
  finishCuttingBoard: "assembly-mallet",
  finishTwoToneBoard: "assembly-mallet",
};

const FALLBACK_OPERATION_CLIP = "assembly-mallet";

/** Relative level per clip. Frequent cues sit low so they don't fatigue. */
const CLIP_GAIN: Record<string, number> = {
  "hand-sanding": 0.5,
  "orbital-sander": 0.6,
  "pallet-dismantle": 0.7,
  "glue-clamp": 0.5,
  "assembly-mallet": 0.6,
  "dispose-toss": 0.6,
  "commission-complete": 0.9,
  "cash-register": 0.6,
  "material-pickup": 0.45,
  "material-drop": 0.45,
};

/**
 * Minimum gap between two plays of the same clip. Guards against machine-gun
 * audio: a sales table sells one item per tick, which at the fastest speed is
 * 20 ticks/second.
 */
const DEFAULT_MIN_GAP_MS = 60;
const CLIP_MIN_GAP_MS: Record<string, number> = {
  "cash-register": 250,
};

/**
 * Clips that are NOT physical events in the shop: reward stingers and
 * marketplace bookkeeping play dry, while everything else goes through the
 * room bus and picks up the shop's acoustics (see `audioBus.ts`).
 */
const NON_DIEGETIC_CLIPS = new Set(["commission-complete", "cash-register"]);

const lastPlayedAt = new Map<string, number>();

function clipFor(event: SoundEvent): string | null {
  switch (event.kind) {
    case "operation-complete": {
      if (event.operationId === undefined) return FALLBACK_OPERATION_CLIP;
      const clip = OPERATION_CLIP[event.operationId];
      // Distinguish "explicitly silent" (null) from "no entry" (undefined).
      return clip === undefined ? FALLBACK_OPERATION_CLIP : clip;
    }
    case "commission-complete":
      return "commission-complete";
    case "sale":
      return "cash-register";
    case "material-pickup":
      return "material-pickup";
    case "material-drop":
      return "material-drop";
  }
}

function playThrottled(clip: string): void {
  const now = Date.now();
  const last = lastPlayedAt.get(clip);
  const minGap = CLIP_MIN_GAP_MS[clip] ?? DEFAULT_MIN_GAP_MS;
  if (last !== undefined && now - last < minGap) return;
  lastPlayedAt.set(clip, now);
  playSound(
    clip,
    CLIP_GAIN[clip] ?? 1,
    NON_DIEGETIC_CLIPS.has(clip) ? "sfx" : "room",
  );
}

export const GameSoundLayer: React.FC = () => {
  const gameState = useGameState();
  const applyAction = useApplyGameAction();
  const pending = gameState.pendingSounds;

  useEffect(() => {
    if (!pending || pending.length === 0) return;
    // Collapse duplicates within a drain — three machines finishing on the same
    // tick should sound like one hit, not a flam.
    const clips = new Set<string>();
    for (const event of pending) {
      const clip = clipFor(event);
      if (clip) clips.add(clip);
    }
    clips.forEach(playThrottled);
    // Drain the queue now that its cues have been played.
    applyAction(clearPendingSoundsAction);
  }, [pending, applyAction]);

  return null;
};
