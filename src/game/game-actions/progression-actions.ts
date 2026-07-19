import { GameAction } from "../GameState";
import { tutorialStageFor, UNLOCK_CONDITIONS } from "../progression-helpers";

export function incrementCommissionsCompletedAction(): GameAction {
  return (gameState) => {
    return {
      ...gameState,
      progression: {
        ...gameState.progression,
        commissionsCompleted: gameState.progression.commissionsCompleted + 1,
      },
    };
  };
}

/**
 * Applies any unlock whose condition is now met (see UNLOCK_CONDITIONS) and
 * advances the tutorial stage to match. Run this after any action that could
 * change what the player has earned or owns.
 */
export function checkProgressionMilestonesAction(): GameAction {
  return (gameState) => {
    let progression = gameState.progression;
    let storage = gameState.storage;

    for (const [flag, conditionMet] of Object.entries(UNLOCK_CONDITIONS)) {
      const key = flag as keyof typeof UNLOCK_CONDITIONS;
      if (!progression[key] && conditionMet(gameState)) {
        progression = { ...progression, [key]: true };
        // The sales table can't be bought — it's granted once, here, so the
        // player can never be priced out of their only way to earn money.
        if (key === "freeSelling") {
          storage = {
            ...storage,
            machines: [...storage.machines, "salesTable"],
          };
        }
      }
    }

    const updatedState = { ...gameState, progression, storage };
    const tutorialStage = Math.max(
      progression.tutorialStage,
      tutorialStageFor(updatedState),
    );

    if (
      progression === gameState.progression &&
      tutorialStage === progression.tutorialStage
    ) {
      return gameState;
    }
    return {
      ...updatedState,
      progression: { ...progression, tutorialStage },
    };
  };
}
