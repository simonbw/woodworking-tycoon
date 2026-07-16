import { GameAction, GameState } from "../GameState";
import { SoundEvent } from "../SoundEvent";

/**
 * Stable empty queue. Reusing one reference means "no pending sounds" keeps a
 * constant identity across states, so the `GameSoundLayer` effect (which is
 * keyed on the queue) doesn't re-fire on every unrelated render.
 */
export const NO_SOUNDS: ReadonlyArray<SoundEvent> = [];

/** Append a sound cue to the queue (pure). */
export function emitSound(gameState: GameState, event: SoundEvent): GameState {
  return {
    ...gameState,
    pendingSounds: [...(gameState.pendingSounds ?? NO_SOUNDS), event],
  };
}

/**
 * Empty the queue once its cues have been played. Returns the same state
 * untouched when already empty, so the drain doesn't churn renders needlessly.
 */
export const clearPendingSoundsAction: GameAction = (gameState) =>
  gameState.pendingSounds && gameState.pendingSounds.length > 0
    ? { ...gameState, pendingSounds: NO_SOUNDS }
    : gameState;
