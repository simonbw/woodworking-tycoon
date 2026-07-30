import { useSyncExternalStore } from "react";

/**
 * Where the truck is in its trip, as the *presentation* sees it. The
 * simulation only knows `player.away`; the departure and arrival rolls
 * are pure theater layered on top (see TripTransitionLayer), so the
 * stage lives outside GameState the way the walking body does.
 *
 *  parked    — home, interactive; the shop as normal
 *  departing — away is set, but the shop is still on screen while the
 *              truck rolls out; the trip overlay waits behind the fade
 *  away      — the trip overlay owns the screen
 *  arriving  — away is cleared, the shop is back, the truck is rolling
 *              in; the player stays hidden and input held until parked
 *
 * A tiny external store rather than context: TruckSprite reads it from
 * inside the PIXI tree every frame, React surfaces subscribe with
 * useTruckStage, and neither should re-render the world per frame.
 */
export type TruckStage = "parked" | "departing" | "away" | "arriving";

let stage: TruckStage = "parked";
let stageStartedAt = 0;
const listeners = new Set<() => void>();

export function setTruckStage(next: TruckStage): void {
  if (next === stage) return;
  stage = next;
  stageStartedAt = performance.now();
  for (const listener of [...listeners]) {
    listener();
  }
}

export function getTruckStage(): TruckStage {
  return stage;
}

/** When the current stage began (performance.now() clock), for motion. */
export function getTruckStageStartedAt(): number {
  return stageStartedAt;
}

export function subscribeTruckStage(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The current stage, as React state. */
export function useTruckStage(): TruckStage {
  return useSyncExternalStore(subscribeTruckStage, getTruckStage);
}
