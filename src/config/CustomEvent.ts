import type { PayoutEvent } from "../game/PayoutEvent";
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
  /**
   * A completed sale, announced so it can be celebrated (the old world's
   * pendingPayouts queue, as an event). The StreetSystem dispatches it;
   * the reward-flight view layer (phase 8) listens. Headless games have
   * no listener and the dispatch is a no-op.
   */
  payout: { payout: PayoutEvent };
};
