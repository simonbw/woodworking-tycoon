import { GameState } from "../GameState";
import { SKILL_TYPES, SkillId } from "../Skill";
import { hasSkill, levelForXp } from "../skill-helpers";

/**
 * Adds craft XP, converting any level-ups into skill points. Plain function
 * (not a GameAction) so tickAction and commission completion can fold it
 * into their own state updates.
 */
export function withXp(gameState: GameState, amount: number): GameState {
  if (amount <= 0) {
    return gameState;
  }
  const { progression } = gameState;
  const newXp = progression.xp + amount;
  const levelsGained = levelForXp(newXp) - levelForXp(progression.xp);
  return {
    ...gameState,
    progression: {
      ...progression,
      xp: newXp,
      skillPoints: progression.skillPoints + levelsGained,
    },
  };
}

/** Spends one skill point to unlock a skill whose prerequisites are met. */
export function spendSkillPointAction(skillId: SkillId) {
  return (gameState: GameState): GameState => {
    const { progression } = gameState;
    const skill = SKILL_TYPES[skillId];

    if (hasSkill(progression, skillId)) {
      console.warn(`Skill ${skillId} is already unlocked`);
      return gameState;
    }
    if (progression.skillPoints < 1) {
      console.warn("No skill points to spend");
      return gameState;
    }
    if (!skill.requires.every((required) => hasSkill(progression, required))) {
      console.warn(`Skill ${skillId} is missing prerequisites`);
      return gameState;
    }

    return {
      ...gameState,
      progression: {
        ...progression,
        skillPoints: progression.skillPoints - 1,
        unlockedSkills: [...progression.unlockedSkills, skillId],
      },
    };
  };
}
