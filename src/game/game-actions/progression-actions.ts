import { GameAction } from "../GameState";

export function advanceTutorialStageAction(stage: number): GameAction {
  return (gameState) => {
    return {
      ...gameState,
      progression: {
        ...gameState.progression,
        tutorialStage: stage,
      },
    };
  };
}

export function unlockStoreAction(): GameAction {
  return (gameState) => {
    return {
      ...gameState,
      progression: {
        ...gameState.progression,
        storeUnlocked: true,
      },
    };
  };
}

export function unlockShopLayoutAction(): GameAction {
  return (gameState) => {
    return {
      ...gameState,
      progression: {
        ...gameState.progression,
        shopLayoutUnlocked: true,
      },
    };
  };
}

export function unlockFreeSellingAction(): GameAction {
  return (gameState) => {
    return {
      ...gameState,
      progression: {
        ...gameState.progression,
        freeSelling: true,
      },
    };
  };
}

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

export function checkProgressionMilestonesAction(): GameAction {
  return (gameState) => {
    const { commissionsCompleted, tutorialStage, storeUnlocked, freeSelling } = gameState.progression;
    let updatedState = gameState;

    // First commission: Unlock store tab, advance to tutorial stage 1
    if (commissionsCompleted >= 1 && tutorialStage < 1) {
      updatedState = advanceTutorialStageAction(1)(updatedState);
    }
    if (commissionsCompleted >= 1 && !storeUnlocked) {
      updatedState = unlockStoreAction()(updatedState);
    }

    // Shop layout is now unlocked when purchasing miter saw, not by commission count

    // Third commission: Unlock free selling feature
    if (commissionsCompleted >= 3 && !freeSelling) {
      updatedState = unlockFreeSellingAction()(updatedState);
    }

    return updatedState;
  };
}