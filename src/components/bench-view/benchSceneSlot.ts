import React from "react";
import { BenchGroup } from "../../game/bench-work/bench-group";
import { StageFit } from "./stageMath";

/**
 * The bench scene's slot in the shop's stage. The bench view owns the
 * scene — its state, its pointer handling, its DOM chrome — but the
 * pixels render inside the shop's one canvas: BenchWorkSurface publishes
 * the finished scene subtree here every commit, and the shop's
 * BenchDiveLayer renders it in a screen-space container above the world,
 * running the dive (the camera's lean into the bench) as one transform
 * on one ticker. Same mutable-singleton family as playerMotionStore and
 * truckStageStore: written by React, read per-frame by ticks.
 */

/** How long the lean in (or back out) takes. */
export const BENCH_DIVE_MS = 650;

export interface BenchSceneSlot {
  /**
   * machineKey of the opened bench — the same key StationSheet mounts
   * the surface under. A new key is a new dive: the clock restarts and
   * the scene container remounts, so no stroke or spring state can
   * bleed from one bench into the next.
   */
  readonly benchKey: string;
  /** The scene subtree (backdrop + work surface), closures and all. */
  readonly sceneElement: React.ReactNode;
  /** The whole-frame fit: the dive's pivot and scale denominator. */
  readonly frameFit: StageFit;
  /** The bench run: anchor center and the un-turn angle. */
  readonly group: BenchGroup;
  /** 1 leans in to the bench framing, 0 back out to the shop's. */
  readonly target: 0 | 1;
  /** Reduced motion: pin progress to the target, no ramp. */
  readonly instant: boolean;
  /** Fired once each time progress arrives at a target. */
  readonly onRest: (at: 0 | 1) => void;
}

let slot: BenchSceneSlot | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of [...listeners]) listener();
}

/** Replace the slot (null on unmount) and poke React subscribers. */
export function publishBenchScene(next: BenchSceneSlot | null): void {
  slot = next;
  notify();
}

/** The slot as it stands, for per-tick reads. */
export function benchSceneSlot(): BenchSceneSlot | null {
  return slot;
}

export function subscribeBenchScene(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The published slot, as React state (BenchDiveLayer's subscription). */
export function useBenchSceneSlot(): BenchSceneSlot | null {
  return React.useSyncExternalStore(subscribeBenchScene, () => slot);
}

/** Whether the dive is on (bench view mounted), as React state. */
export function useBenchDiveActive(): boolean {
  return React.useSyncExternalStore(subscribeBenchScene, () => slot !== null);
}

/**
 * The bench the player is fully leaned over — set once the dive lands,
 * cleared the instant the pull-back (or a mid-dive reversal) starts.
 * The shop's renderer hides ITS copies of that bench's stock, progress
 * badge, and processing sprites while this is set: the scene is opaque
 * over them and draws the live versions (drags, turn springs, cure
 * chrome), so the shop's static copies would only ghost out from
 * underneath. Everywhere else — including all through the dive, while
 * the scene is still translucent — the shop draws everything, because
 * the shop IS the picture.
 */
let leanedBenchKey: string | null = null;

export function setLeanedBench(key: string | null): void {
  if (leanedBenchKey === key) return;
  leanedBenchKey = key;
  notify();
}

export function useLeanedBenchKey(): string | null {
  return React.useSyncExternalStore(subscribeBenchScene, () => leanedBenchKey);
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
