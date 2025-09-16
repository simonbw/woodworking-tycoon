import { GameState, ProgressionState } from "./GameState";

export function shouldUnlockStore(commissionsCompleted: number): boolean {
  return commissionsCompleted >= 1;
}

export function shouldUnlockShopLayout(commissionsCompleted: number): boolean {
  return commissionsCompleted >= 2;
}

export function shouldUnlockFreeSelling(commissionsCompleted: number): boolean {
  return commissionsCompleted >= 3;
}

export function shouldAdvanceTutorial(gameState: GameState): number | null {
  const { commissionsCompleted, tutorialStage } = gameState.progression;

  if (commissionsCompleted >= 1 && tutorialStage < 1) {
    return 1;
  }
  if (commissionsCompleted >= 2 && tutorialStage < 2) {
    return 2;
  }
  
  return null; // No advancement needed
}

export function getNextMilestone(progression: ProgressionState): string | null {
  const { commissionsCompleted, storeUnlocked, shopLayoutUnlocked, freeSelling } = progression;

  if (commissionsCompleted === 0) {
    return "Complete your first commission to unlock the Store";
  }

  if (commissionsCompleted === 1 && !shopLayoutUnlocked) {
    return "Complete one more commission to unlock Shop Layout editing";
  }

  if (commissionsCompleted === 2 && !freeSelling) {
    return "Complete one more commission to unlock free selling";
  }

  if (commissionsCompleted < 3) {
    return `Complete ${3 - commissionsCompleted} more commission${3 - commissionsCompleted === 1 ? '' : 's'} to unlock all features`;
  }

  return null; // All milestones reached
}

export function getTutorialMessage(tutorialStage: number): string | null {
  switch (tutorialStage) {
    case 0:
      return "Welcome! Complete your first commission to get started.";
    case 1:
      return "Great! You've unlocked the Store. Try completing another commission.";
    case 2:
      return "Excellent! You can now edit your shop layout. One more commission will unlock free selling.";
    default:
      return null;
  }
}

export function getAllUnlockedFeatures(progression: ProgressionState): string[] {
  const features: string[] = [];
  if (progression.storeUnlocked) features.push('Store');
  if (progression.shopLayoutUnlocked) features.push('Shop Layout');
  if (progression.freeSelling) features.push('Free Selling');
  return features;
}

export function getRemainingFeatures(progression: ProgressionState): string[] {
  const features: string[] = [];
  if (!progression.storeUnlocked) features.push('Store');
  if (!progression.shopLayoutUnlocked) features.push('Shop Layout');
  if (!progression.freeSelling) features.push('Free Selling');
  return features;
}