import { GameState, ProgressionState, UnlockableTab, UnlockableFeature } from "./GameState";

export function shouldUnlockTab(commissionsCompleted: number, tab: UnlockableTab): boolean {
  switch (tab) {
    case 'store':
      return commissionsCompleted >= 1;
    case 'layout':
      return commissionsCompleted >= 2;
    default:
      return false;
  }
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

export function getLockedFeatures(progression: ProgressionState): UnlockableFeature[] {
  const allFeatures: UnlockableFeature[] = ['freeSelling'];
  return allFeatures.filter(feature => !progression.unlockedFeatures.includes(feature));
}

export function getLockedTabs(progression: ProgressionState): UnlockableTab[] {
  const allTabs: UnlockableTab[] = ['store', 'layout'];
  return allTabs.filter(tab => !progression.unlockedTabs.includes(tab));
}

export function getNextMilestone(progression: ProgressionState): string | null {
  const { commissionsCompleted, unlockedTabs, unlockedFeatures } = progression;

  if (commissionsCompleted === 0) {
    return "Complete your first commission to unlock the Store";
  }

  if (commissionsCompleted === 1 && !unlockedTabs.includes('layout')) {
    return "Complete one more commission to unlock Shop Layout editing";
  }

  if (commissionsCompleted === 2 && !unlockedFeatures.includes('freeSelling')) {
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

export function isFeatureUnlocked(progression: ProgressionState, feature: UnlockableFeature): boolean {
  return progression.unlockedFeatures.includes(feature);
}

export function isTabUnlocked(progression: ProgressionState, tab: UnlockableTab): boolean {
  return progression.unlockedTabs.includes(tab);
}