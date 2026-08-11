/**
 * A completed sale, announced to the UI so it can be celebrated.
 *
 * The reducer that settles a sale can't animate anything, so it queues
 * one of these and `RewardFlightLayer` turns it into money flying to the
 * balance and a star to the reputation readout, with the cash register's
 * cha-ching when the first coin lands — wherever the player happens to
 * be standing.
 *
 * Same shape of bridge as `SoundEvent`: transient, drained each render, and
 * never persisted to the save.
 */
export interface PayoutEvent {
  /** Unique per emission, so React keys survive two sales in one tick. */
  readonly id: string;
  readonly kind: "sale";
  /** What sold — the piece's name. */
  readonly title: string;
  readonly money: number;
  readonly reputation: number;
  readonly xp: number;
}
