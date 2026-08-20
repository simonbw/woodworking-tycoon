import { GameState } from "../GameState";
import { PayoutEvent } from "../PayoutEvent";

/**
 * Stable empty queue, for the same reason `NO_SOUNDS` is one: "nothing to
 * celebrate" keeps a constant identity across states, so the drain effect
 * (keyed on the queue) doesn't re-fire on every unrelated render.
 */
const NO_PAYOUTS: ReadonlyArray<PayoutEvent> = [];

/**
 * Append a payout announcement to the queue.
 *
 * The id is derived from the state the announcement is made in — the tick,
 * what's already queued, and what was handed over — rather than minted from
 * a counter. Actions run as `setGameState` updaters, and React may invoke an
 * updater more than once against the same base state; a counter handed each
 * invocation a *different* id, so the same handoff could reach the flight
 * layer as two distinct payouts and deal the client's card twice (#159). A
 * derived id makes the repeat identical, which the layer's dedup collapses.
 */
export function emitPayout(
  gameState: GameState,
  event: Omit<PayoutEvent, "id">,
): GameState {
  const queued = gameState.pendingPayouts ?? NO_PAYOUTS;
  return {
    ...gameState,
    pendingPayouts: [
      ...queued,
      {
        ...event,
        id: `payout-${gameState.tick}-${queued.length}-${event.kind}-${event.title}`,
      },
    ],
  };
}
