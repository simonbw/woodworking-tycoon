import { GameAction } from "../GameState";
import { ManualArticleId, MANUAL_ARTICLES } from "../manual";
import { tutorialStageFor, UNLOCK_CONDITIONS } from "../progression-helpers";

/** The player opened these manual articles — clears their NEW markers. */
export function markArticlesReadAction(
  articleIds: ReadonlyArray<ManualArticleId>,
): GameAction {
  return (gameState) => {
    const unread = articleIds.filter(
      (id) => !gameState.progression.readArticles.includes(id),
    );
    if (unread.length === 0) return gameState;
    return {
      ...gameState,
      progression: {
        ...gameState.progression,
        readArticles: [...gameState.progression.readArticles, ...unread],
      },
    };
  };
}

/** The player has read the one-time "sweep it up" note. */
export function dismissDustTipAction(): GameAction {
  return (gameState) => ({
    ...gameState,
    progression: { ...gameState.progression, dustTipDismissed: true },
  });
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

/**
 * Applies any unlock whose condition is now met (see UNLOCK_CONDITIONS) and
 * advances the tutorial stage to match. Run this after any action that could
 * change what the player has earned or owns.
 */
export function checkProgressionMilestonesAction(): GameAction {
  return (gameState) => {
    let progression = gameState.progression;

    for (const [flag, conditionMet] of Object.entries(UNLOCK_CONDITIONS)) {
      const key = flag as keyof typeof UNLOCK_CONDITIONS;
      if (!progression[key] && conditionMet(gameState)) {
        progression = { ...progression, [key]: true };
      }
    }

    // Manual articles unlock off the post-flag state, so an article gated on
    // a flag that flipped this very pass (e.g. sweeping) appears immediately.
    const newArticles = MANUAL_ARTICLES.filter(
      (article) =>
        !progression.unlockedArticles.includes(article.id) &&
        article.unlocked({ ...gameState, progression }),
    ).map((article) => article.id);
    if (newArticles.length > 0) {
      progression = {
        ...progression,
        unlockedArticles: [...progression.unlockedArticles, ...newArticles],
      };
    }

    const updatedState = { ...gameState, progression };
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
