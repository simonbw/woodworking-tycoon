/**
 * A completed handoff, announced to the UI so it can be celebrated.
 *
 * Handing work over at the garage door is the biggest beat in the loop —
 * commissions especially, which the roadmap treats as bosses. The reducers
 * that pay the player out can't animate anything, so they queue one of these
 * and `RewardFlightLayer` turns it into money flying to the balance, a star
 * to the reputation readout, and (for commissions) a card from the client
 * that the player dismisses.
 *
 * Same shape of bridge as `SoundEvent`: transient, drained each render, and
 * never persisted to the save.
 */
export interface PayoutEvent {
  /** Unique per emission, so React keys survive two handoffs in one tick. */
  readonly id: string;
  readonly kind: "commission" | "job";
  /** The commission's title, or the job client's name. */
  readonly title: string;
  readonly money: number;
  readonly reputation: number;
  readonly xp: number;
  /**
   * Commission handoffs only: who took delivery and what they said. Shown
   * on a card the player dismisses before the rewards fly.
   */
  readonly client?: string;
  readonly dialogue?: string;
}
