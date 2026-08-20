import { Game } from "../../core/Game";
import { TutorialTrackId } from "../../game/GameState";
import { ManualArticleId } from "../../game/manual";
import { SKILL_TYPES, SkillId } from "../../game/Skill";
import { hasSkill } from "../../game/skill-helpers";
import { projectGameState } from "../projection";
import { Progression } from "../singletons/Progression";
import { TutorialTracker } from "../singletons/TutorialTracker";

/**
 * The progression command surface: the mutations the journal, the manual,
 * and the tutorial cards can make, ported from the old progression and
 * skill actions. Unlock detection is not here — that's the
 * MilestoneSystem's pass; these are the player's own three moves: reading
 * articles, skipping a tutorial card, and spending a skill point.
 */

/** The player opened these manual articles — clears their NEW markers. */
export function markArticlesRead(
  game: Game,
  articleIds: ReadonlyArray<ManualArticleId>,
): void {
  const progression = game.entities.getSingleton(Progression);
  const unread = articleIds.filter(
    (id) => !progression.readArticles.includes(id),
  );
  if (unread.length === 0) {
    return;
  }
  progression.readArticles = [...progression.readArticles, ...unread];
  game.dispatch("progressionChanged", {});
}

/** The player retired a tutorial card early. One way, like an unlock. */
export function dismissTutorial(game: Game, trackId: TutorialTrackId): void {
  const tracker = game.entities.getSingleton(TutorialTracker);
  const progress = tracker.tutorials[trackId];
  if (progress.dismissed) {
    return;
  }
  tracker.tutorials = {
    ...tracker.tutorials,
    [trackId]: { ...progress, dismissed: true },
  };
  game.dispatch("progressionChanged", {});
}

/** Spends one skill point to unlock a skill whose prerequisites are met. */
export function spendSkillPoint(game: Game, skillId: SkillId): boolean {
  const gameState = projectGameState(game);
  const skill = SKILL_TYPES[skillId];

  if (hasSkill(gameState.progression, skillId)) {
    console.warn(`Skill ${skillId} is already unlocked`);
    return false;
  }
  if (gameState.progression.skillPoints < 1) {
    console.warn("No skill points to spend");
    return false;
  }
  if (
    !skill.requires.every((required) =>
      hasSkill(gameState.progression, required),
    )
  ) {
    console.warn(`Skill ${skillId} is missing prerequisites`);
    return false;
  }

  const progression = game.entities.getSingleton(Progression);
  progression.skillPoints -= 1;
  progression.unlockedSkills = [...progression.unlockedSkills, skillId];
  game.dispatch("progressionChanged", {});
  return true;
}
