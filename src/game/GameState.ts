import { MachineState, MachineId } from "./Machine";
import { InputMaterialWithQuantity } from "./Machine";
import { MaterialInstance } from "./Materials";
import { SkillId } from "./Skill";
import { SoundEvent } from "./SoundEvent";
import { ToolId } from "./Tool";
import { Person } from "./Person";
import { ShopInfo } from "./ShopInfo";
import { Vector } from "./Vectors";

export type MaterialPile = {
  material: MaterialInstance;
  position: Vector;
};

export type GameAction = (gameState: GameState) => GameState;

/** Represents all of the state for the game simulation. This is what gets loaded/saved. Does not include UI state. */
export interface ProgressionState {
  readonly tutorialStage: number;
  readonly storeUnlocked: boolean;
  readonly shopLayoutUnlocked: boolean;
  readonly freeSelling: boolean;
  readonly commissionsCompleted: number;
  readonly tickSpeedControlsUnlocked: boolean;
  /** Lifetime craft XP (never spent — levels derive from it). */
  readonly xp: number;
  /** Unspent skill points (1 per level gained). */
  readonly skillPoints: number;
  readonly unlockedSkills: ReadonlyArray<SkillId>;
}

export interface GameState {
  readonly tick: number;
  readonly money: number;
  readonly reputation: number;
  readonly materialPiles: ReadonlyArray<MaterialPile>;
  readonly machines: ReadonlyArray<MachineState>;
  readonly shopInfo: ShopInfo;
  readonly player: Person;
  readonly storage: {
    machines: ReadonlyArray<MachineId>;
    tools: ReadonlyArray<ToolId>;
  };
  readonly progression: ProgressionState;
  /**
   * Transient queue of sound cues emitted by the action(s) that produced this
   * state, drained by `GameSoundLayer` each render. Optional and never
   * persisted (stripped in `saveLoad`); treat a missing value as empty.
   */
  readonly pendingSounds?: ReadonlyArray<SoundEvent>;
}

/**
 * A work order in the authored commission sequence. The active commission is
 * derived from `progression.commissionsCompleted` (see commissionSequence.ts)
 * rather than stored in GameState.
 */
export interface Commission {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly requiredMaterials: ReadonlyArray<InputMaterialWithQuantity>;
  readonly rewardMoney: number;
  readonly rewardReputation: number;
}
