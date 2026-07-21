import { ProgressionState } from "./GameState";
import {
  Machine,
  MachineOperation,
  OperationPhase,
  ParameterizedOperation,
} from "./Machine";
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

const GLUE_OPERATION_IDS = [
  "glueUpPanel",
  "glueUpPair",
  "extendPanel",
  "joinPanels",
];

/**
 * The operation's phase list with passive skills applied per phase, then
 * the dust slowdown (see Dust.ts machineDustMultiplier) and the station's
 * work speed (MachineType.workSpeed — a solid worktable beats the wobbly
 * makeshift bench) applied to the attended phases — a buried machine or a
 * bad bench slows your handwork, not the glue's cure. Ops that declare no
 * phases are one attended stretch of hand work. Phase durations are read
 * as each phase is entered, so a skill bought (or a floor swept)
 * mid-operation affects the remaining phases but not the current one.
 */
export function getOperationPhases(
  operation: MachineOperation | ParameterizedOperation,
  progression: ProgressionState,
  dustMultiplier: number = 1,
  workSpeed: number = 1,
): ReadonlyArray<OperationPhase> {
  const phases = operation.phases ?? [
    { name: operation.name, duration: operation.duration, attended: true },
  ];
  return phases.map((phase) => {
    let duration = phase.duration;
    if (
      hasSkill(progression, "efficientSanding") &&
      (operation.id.endsWith("SandBoard") || operation.id.endsWith("SandPanel"))
    ) {
      duration = Math.round(duration * 0.6);
    }
    // Better glue cures faster — the clamping handwork is unchanged
    if (
      hasSkill(progression, "quickDryGlue") &&
      GLUE_OPERATION_IDS.includes(operation.id) &&
      !phase.attended
    ) {
      duration = Math.round(duration * 0.6);
    }
    if (phase.attended && dustMultiplier !== 1) {
      duration = Math.round(duration * dustMultiplier);
    }
    if (phase.attended && workSpeed !== 1) {
      duration = Math.max(1, Math.round(duration / workSpeed));
    }
    return { ...phase, duration };
  });
}

/** Total operation duration after passive skills, dust, and the station's
 * work speed (all phases). */
export function getOperationDuration(
  operation: MachineOperation | ParameterizedOperation,
  progression: ProgressionState,
  dustMultiplier: number = 1,
  workSpeed: number = 1,
): number {
  return getOperationPhases(
    operation,
    progression,
    dustMultiplier,
    workSpeed,
  ).reduce((sum, phase) => sum + phase.duration, 0);
}
