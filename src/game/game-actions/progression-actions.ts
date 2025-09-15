import { GameAction, UnlockableTab, UnlockableFeature } from "../GameState";

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

export function unlockTabAction(tab: UnlockableTab): GameAction {
  return (gameState) => {
    if (gameState.progression.unlockedTabs.includes(tab)) {
      return gameState; // Tab already unlocked
    }
    
    return {
      ...gameState,
      progression: {
        ...gameState.progression,
        unlockedTabs: [...gameState.progression.unlockedTabs, tab],
      },
    };
  };
}

export function unlockFeatureAction(feature: UnlockableFeature): GameAction {
  return (gameState) => {
    if (gameState.progression.unlockedFeatures.includes(feature)) {
      return gameState; // Feature already unlocked
    }
    
    return {
      ...gameState,
      progression: {
        ...gameState.progression,
        unlockedFeatures: [...gameState.progression.unlockedFeatures, feature],
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
    const { commissionsCompleted } = gameState.progression;
    let updatedState = gameState;

    // First commission: Unlock store tab, advance to tutorial stage 1
    if (commissionsCompleted >= 1 && gameState.progression.tutorialStage < 1) {
      updatedState = advanceTutorialStageAction(1)(updatedState);
      updatedState = unlockTabAction('store')(updatedState);
    }

    // Second commission: Unlock layout tab, advance to tutorial stage 2
    if (commissionsCompleted >= 2 && gameState.progression.tutorialStage < 2) {
      updatedState = advanceTutorialStageAction(2)(updatedState);
      updatedState = unlockTabAction('layout')(updatedState);
    }

    // Third commission: Unlock free selling feature
    if (commissionsCompleted >= 3 && !gameState.progression.unlockedFeatures.includes('freeSelling')) {
      updatedState = unlockFeatureAction('freeSelling')(updatedState);
    }

    return updatedState;
  };
}