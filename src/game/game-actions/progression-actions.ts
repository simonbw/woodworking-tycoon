import { GameAction } from "../GameState";
import { ManualArticleId, MANUAL_ARTICLES } from "../manual";
import { UNLOCK_CONDITIONS } from "../progression-helpers";
import { advanceTutorials } from "../tutorial";

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
    // The coach walks forward over everything the shop already satisfies.
    // This pass runs every tick, so no action has to know it exists.
    const tutorials = advanceTutorials(updatedState);

    if (
      progression === gameState.progression &&
      tutorials === progression.tutorials
    ) {
      return gameState;
    }
    return {
      ...updatedState,
      progression: { ...progression, tutorials },
    };
  };
}
