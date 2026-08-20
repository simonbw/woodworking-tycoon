import { GameState } from "../GameState";
import { levelForXp } from "../skill-helpers";

/**
 * Adds craft XP, converting any level-ups into skill points. Plain function
 * (not a GameAction) so tickAction can fold it into its own state
 * updates.
 */
export function withXp(gameState: GameState, amount: number): GameState {
  if (amount <= 0) {
    return gameState;
  }
  const { progression } = gameState;
  const newXp = progression.xp + amount;
  const levelsGained = levelForXp(newXp) - levelForXp(progression.xp);
  return {
    ...gameState,
    progression: {
      ...progression,
      xp: newXp,
      skillPoints: progression.skillPoints + levelsGained,
    },
  };
}
