import { GameAction } from "../GameState";
import { CLAMP_COST } from "../Clamp";

/**
 * Buys one clamp. Clamps aren't consumed, so they're sold singly rather
 * than by the pack — you buy the rack up one bar at a time, and each one
 * widens what you can have curing at once (see Clamp.ts).
 */
export function buyClampAction(): GameAction {
  return (gameState) => {
    if (gameState.money < CLAMP_COST) {
      console.warn("Tried to buy a clamp without enough money");
      return gameState;
    }
    return {
      ...gameState,
      money: gameState.money - CLAMP_COST,
      clamps: gameState.clamps + 1,
    };
  };
}
