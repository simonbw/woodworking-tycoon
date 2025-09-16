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
    const { commissionsCompleted, tutorialStage, storeUnlocked, shopLayoutUnlocked, freeSelling } = gameState.progression;
    let updatedState = gameState;

    // First commission: Unlock store tab, advance to tutorial stage 1
    if (commissionsCompleted >= 1 && tutorialStage < 1) {
      updatedState = advanceTutorialStageAction(1)(updatedState);
    }
    if (commissionsCompleted >= 1 && !storeUnlocked) {
      updatedState = unlockStoreAction()(updatedState);
    }

    // Second commission: Unlock layout tab, advance to tutorial stage 2
    if (commissionsCompleted >= 2 && tutorialStage < 2) {
      updatedState = advanceTutorialStageAction(2)(updatedState);
    }
    if (commissionsCompleted >= 2 && !shopLayoutUnlocked) {
      updatedState = unlockShopLayoutAction()(updatedState);
    }

    // Third commission: Unlock free selling feature
    if (commissionsCompleted >= 3 && !freeSelling) {
      updatedState = unlockFreeSellingAction()(updatedState);
    }

    return updatedState;
  };
}