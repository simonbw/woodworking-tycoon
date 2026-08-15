import type { SoundEvent } from "../game/SoundEvent";

/**
 * Global event types that can be dispatched by the Game and listened to by entities.
 */
export type CustomEvents = {
  /**
   * A sound cue emitted by the simulation (the old world's pendingSounds
   * queue, as an event). Sim entities and commands dispatch it; the sound
   * view layer (phase 8) listens. Headless games have no listener and the
   * dispatch is a no-op.
   */
  sound: { sound: SoundEvent };
};
