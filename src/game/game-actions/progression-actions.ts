import { COMMISSION_SEQUENCE } from "../commissionSequence";
import { GameAction } from "../GameState";
import { ManualArticleId, MANUAL_ARTICLES } from "../manual";
import { UNLOCK_CONDITIONS } from "../progression-helpers";
import { advanceTutorialStep } from "../tutorial";
import { emitSound } from "./sound-actions";

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

/** The player retired the guided opening early. One way, like an unlock. */
export function dismissTutorialAction(): GameAction {
  return (gameState) =>
    gameState.progression.tutorialDismissed
      ? gameState
      : {
          ...gameState,
          progression: { ...gameState.progression, tutorialDismissed: true },
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

/** The player has sat through the phone call that delivered a commission. */
export function markCommissionArrivalSeenAction(): GameAction {
  return (gameState) =>
    gameState.progression.commissionArrivalSeen
      ? gameState
      : {
          ...gameState,
          progression: { ...gameState.progression, commissionArrivalSeen: true },
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

    // The next commission arrives when reputation reaches its threshold:
    // the phone rings and the call plays out in the UI. Runs before the
    // article scan so anything gated on the offer unlocks the same pass.
    const nextCommission =
      progression.commissionsOffered === progression.commissionsCompleted
        ? COMMISSION_SEQUENCE[progression.commissionsCompleted]
        : undefined;
    const phoneRings =
      nextCommission !== undefined &&
      gameState.reputation >= nextCommission.minReputation;
    if (phoneRings) {
      progression = {
        ...progression,
        commissionsOffered: progression.commissionsOffered + 1,
        commissionArrivalSeen: false,
      };
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
    const tutorialStep = advanceTutorialStep(updatedState);

    if (
      progression === gameState.progression &&
      tutorialStep === progression.tutorialStep
    ) {
      return gameState;
    }
    const result = {
      ...updatedState,
      progression: { ...progression, tutorialStep },
    };
    return phoneRings ? emitSound(result, { kind: "phone-ring" }) : result;
  };
}
