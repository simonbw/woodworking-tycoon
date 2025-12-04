import { GameState, ProgressionState } from "./GameState";

export function shouldUnlockStore(commissionsCompleted: number): boolean {
  return commissionsCompleted >= 1;
}

export function shouldUnlockShopLayout(hasMiterSaw: boolean): boolean {
  return hasMiterSaw;
}

export function shouldUnlockFreeSelling(commissionsCompleted: number): boolean {
  return commissionsCompleted >= 3;
}

export function shouldAdvanceTutorial(gameState: GameState): number | null {
  const { commissionsCompleted, tutorialStage } = gameState.progression;

  if (commissionsCompleted >= 1 && tutorialStage < 1) {
    return 1;
  }
  // Tutorial stage 2 is now advanced when purchasing miter saw, not by commission count

  return null; // No advancement needed
}

export function getNextMilestone(progression: ProgressionState): string | null {
  const {
    commissionsCompleted,
    storeUnlocked,
    shopLayoutUnlocked,
    freeSelling,
  } = progression;

  if (commissionsCompleted === 0) {
    return "Complete your first commission to unlock the Store";
  }

  if (storeUnlocked && !shopLayoutUnlocked) {
    return "Buy a Miter Saw from the Store to unlock Shop Layout editing";
  }

  if (shopLayoutUnlocked && !freeSelling) {
    return "Complete more commissions to unlock free selling";
  }

  return null; // All milestones reached
}

export function getTutorialMessage(tutorialStage: number): string | null {
  switch (tutorialStage) {
    case 0:
      return "Welcome! Complete your first commission to get started.";
    case 1:
      return "Great! You've unlocked the Store. Buy a Miter Saw to expand your capabilities.";
    case 2:
      return "Excellent! You can now edit your shop layout. Complete more commissions to unlock free selling.";
    default:
      return null;
  }
}

export function getAllUnlockedFeatures(
  progression: ProgressionState,
): string[] {
  const features: string[] = [];
  if (progression.storeUnlocked) features.push("Store");
  if (progression.shopLayoutUnlocked) features.push("Shop Layout");
  if (progression.freeSelling) features.push("Free Selling");
  return features;
}

export function getRemainingFeatures(progression: ProgressionState): string[] {
  const features: string[] = [];
  if (!progression.storeUnlocked) features.push("Store");
  if (!progression.shopLayoutUnlocked) features.push("Shop Layout");
  if (!progression.freeSelling) features.push("Free Selling");
  return features;
}
