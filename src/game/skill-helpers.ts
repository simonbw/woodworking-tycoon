import { ProgressionState } from "./GameState";
import { Machine, MachineOperation, ParameterizedOperation } from "./Machine";
import { SkillId } from "./Skill";

/**
 * XP needed to go from a given level to the next. Increasing cost keeps
 * skill points feeling like events, not drips.
 */
export function xpCostOfLevel(level: number): number {
  return 150 + (level - 1) * 100;
}

/** The level a player with this much lifetime XP has reached (starts at 1). */
export function levelForXp(xp: number): number {
  let level = 1;
  let remaining = xp;
  while (remaining >= xpCostOfLevel(level)) {
    remaining -= xpCostOfLevel(level);
    level++;
  }
  return level;
}

/** XP accumulated toward the next level, and that level's full cost. */
export function xpProgress(xp: number): { current: number; needed: number } {
  let level = 1;
  let remaining = xp;
  while (remaining >= xpCostOfLevel(level)) {
    remaining -= xpCostOfLevel(level);
    level++;
  }
  return { current: remaining, needed: xpCostOfLevel(level) };
}

export function hasSkill(
  progression: ProgressionState,
  skillId: SkillId,
): boolean {
  return progression.unlockedSkills.includes(skillId);
}

/**
 * The operations the player can actually use at a station: the combined
 * machine+tool list, minus recipes whose skill hasn't been earned.
 */
export function availableOperations(
  machine: Machine,
  progression: ProgressionState,
): ReadonlyArray<MachineOperation | ParameterizedOperation> {
  return machine.operations.filter(
    (operation) =>
      !operation.requiredSkill ||
      hasSkill(progression, operation.requiredSkill),
  );
}

/**
 * Operation duration after passive skills. Applied when work starts, so
 * in-flight operations aren't affected by mid-operation purchases.
 */
export function getOperationDuration(
  operation: MachineOperation | ParameterizedOperation,
  progression: ProgressionState,
): number {
  let duration = operation.duration;
  if (
    hasSkill(progression, "efficientSanding") &&
    (operation.id.endsWith("SandBoard") || operation.id.endsWith("SandPanel"))
  ) {
    duration = Math.round(duration * 0.6);
  }
  if (
    hasSkill(progression, "quickDryGlue") &&
    ["glueUpPanel", "glueUpPair", "extendPanel"].includes(operation.id)
  ) {
    duration = Math.round(duration * 0.6);
  }
  return duration;
}
