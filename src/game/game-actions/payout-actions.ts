import { GameAction, GameState } from "../GameState";
import { PayoutEvent } from "../PayoutEvent";

/**
 * Stable empty queue, for the same reason `NO_SOUNDS` is one: "nothing to
 * celebrate" keeps a constant identity across states, so the drain effect
 * (keyed on the queue) doesn't re-fire on every unrelated render.
 */
export const NO_PAYOUTS: ReadonlyArray<PayoutEvent> = [];

let nextPayoutId = 0;

/** Append a payout announcement to the queue (pure apart from the id counter). */
export function emitPayout(
  gameState: GameState,
  event: Omit<PayoutEvent, "id">,
): GameState {
  return {
    ...gameState,
    pendingPayouts: [
      ...(gameState.pendingPayouts ?? NO_PAYOUTS),
      { ...event, id: `payout-${nextPayoutId++}` },
    ],
  };
}

/**
 * Empty the queue once the flight layer has picked it up. Returns the same
 * state untouched when already empty, so the drain doesn't churn renders.
 */
export const clearPendingPayoutsAction: GameAction = (gameState) =>
  gameState.pendingPayouts && gameState.pendingPayouts.length > 0
    ? { ...gameState, pendingPayouts: NO_PAYOUTS }
    : gameState;
