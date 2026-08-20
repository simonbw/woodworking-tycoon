import { GameState } from "../GameState";
import { SoundEvent } from "../SoundEvent";

/**
 * Stable empty queue. Reusing one reference means "no pending sounds" keeps a
 * constant identity across states, so the `GameSoundLayer` effect (which is
 * keyed on the queue) doesn't re-fire on every unrelated render.
 */
const NO_SOUNDS: ReadonlyArray<SoundEvent> = [];

/** Append a sound cue to the queue (pure). */
export function emitSound(gameState: GameState, event: SoundEvent): GameState {
  return {
    ...gameState,
    pendingSounds: [...(gameState.pendingSounds ?? NO_SOUNDS), event],
  };
}
