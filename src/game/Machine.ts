import { LRUCache } from "typescript-lru-cache";
import type { ConsumableAmount } from "./Consumable";
import { MaterialInstance } from "./Materials";
import { SkillId } from "./Skill";
import { TOOL_TYPES, ToolId } from "./Tool";
import { Direction, rotateVec, translateVec, Vector } from "./Vectors";
import { garbageCan } from "./machines/garbageCan";
import { jobsiteTableSaw } from "./machines/jobsiteTableSaw";
import { jointer } from "./machines/jointer";
import { lunchboxPlaner } from "./machines/lunchboxPlaner";
import { makeshiftBench } from "./machines/makeshiftBench";
import { miterSaw } from "./machines/miterSaw";
import { workspace } from "./machines/workspace";

export interface MachineType {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly operations: ReadonlyArray<MachineOperation | ParameterizedOperation>;
  readonly cellsOccupied: ReadonlyArray<Vector>;
  readonly freeCellsNeeded: ReadonlyArray<Vector>;
  readonly operationPosition?: Vector;
  /**
   * Where finished stock lands on feed-through machines (planer, jointer,
   * table saw): the cell opposite the operation cell. Outputs are collected
   * standing there, not at the infeed. Omitted for single-point stations
   * like the miter saw and benches, where outputs stay at the machine.
   */
  readonly outputPosition?: Vector;
  readonly cost: number;
  readonly materialStorage: number;
  readonly toolSlots: number;
  readonly className?: string;
  readonly inputSpaces: number;
}

export const MACHINE_TYPES = {
  makeshiftBench,
  workspace,
  jobsiteTableSaw,
  miterSaw,
  lunchboxPlaner,
  jointer,
  garbageCan,
} satisfies { [id: string]: MachineType };
export type MachineId = keyof typeof MACHINE_TYPES;

/**
 * One stretch of an operation. Attended phases only progress while the
 * player is standing at the machine's operation cell; phases with
 * attended: false run on their own (glue curing, and someday kilns and
 * finishes). An operation can't ENTER an attended phase without the player
 * there — it sits ready until they arrive.
 */
export interface OperationPhase {
  readonly name: string;
  readonly duration: number;
  readonly attended: boolean;
}

export interface MachineOperation {
  readonly id: string;
  readonly name: string;
  /** Total ticks; must equal the sum of phases when phases are declared. */
  readonly duration: number;
  /**
   * Omitted for ordinary hand work: the whole duration is one attended
   * phase. Declared only when part of the operation runs without you.
   */
  readonly phases?: ReadonlyArray<OperationPhase>;
  /** Skill that must be unlocked before this recipe is usable (see Skill.ts). */
  readonly requiredSkill?: SkillId;
  /**
   * Shop supplies drawn from GameState.consumables when the operation
   * starts (no refunds — the glue is already out of the bottle).
   */
  readonly requiredConsumables?: ReadonlyArray<ConsumableAmount>;
  /**
   * Sawdust thrown per attended tick while this runs, landed around the
   * machine (see Dust.ts). Omitted: no appreciable mess (assembly, glue).
   */
  readonly dustOutput?: number;
  readonly inputMaterials: ReadonlyArray<InputMaterialWithQuantity>;
  readonly output: (
    materials: ReadonlyArray<MaterialInstance>,
  ) => OperationOutput;
}

export type InputMaterial<T extends MaterialInstance = MaterialInstance> = {
  [K in keyof T]?: ReadonlyArray<T[K]>;
} & {
  /**
   * Escape hatch for constraints the flat allowed-values fields can't
   * express (e.g. conditions on a panel's strip list). Checked in addition
   * to the flat fields by materialMeetsInput.
   */
  readonly matches?: (material: MaterialInstance) => boolean;
};

export type InputMaterialWithQuantity<
  T extends MaterialInstance = MaterialInstance,
> = InputMaterial<T> & {
  readonly quantity: number;
};

export interface OperationOutput {
  inputs: ReadonlyArray<MaterialInstance>;
  outputs: ReadonlyArray<MaterialInstance>;
  /**
   * Tools granted on completion (delivered to tool storage). This is how
   * shop-made jigs like the crosscut sled come into the world — some
   * recipes produce tooling, not product.
   */
  toolOutputs?: ReadonlyArray<ToolId>;
  /**
   * Supplies recovered on completion (added to GameState.consumables) —
   * e.g. the nails that come out of a dismantled pallet.
   */
  consumableOutputs?: ReadonlyArray<ConsumableAmount>;
}

// Parameterized operation system
export interface OperationParameter<T = number | string> {
  readonly id: string;
  readonly name: string;
  readonly values: ReadonlyArray<T>;
  /** Suffix appended to numeric values in the UI. Defaults to inches. */
  readonly unit?: string;
}

export type ParameterValues = Record<string, number | string>;

export interface ParameterizedOperation<
  TParams extends ParameterValues = ParameterValues,
> {
  readonly id: string;
  readonly name: string;
  /** Total ticks; must equal the sum of phases when phases are declared. */
  readonly duration: number;
  /** See MachineOperation.phases. */
  readonly phases?: ReadonlyArray<OperationPhase>;
  /** Skill that must be unlocked before this recipe is usable (see Skill.ts). */
  readonly requiredSkill?: SkillId;
  /** See MachineOperation.requiredConsumables. */
  readonly requiredConsumables?: ReadonlyArray<ConsumableAmount>;
  /** See MachineOperation.dustOutput. */
  readonly dustOutput?: number;
  readonly parameters: ReadonlyArray<OperationParameter>;
  readonly getInputMaterials: (
    params: TParams,
  ) => ReadonlyArray<InputMaterialWithQuantity>;
  readonly output: (
    materials: ReadonlyArray<MaterialInstance>,
    params: TParams,
  ) => OperationOutput;
}

export interface OperationProgress {
  readonly status: "notStarted" | "inProgress" | "finished";
  /** Index into the operation's phase list (0 for single-phase ops). */
  readonly phaseIndex: number;
  /**
   * Ticks left in the current phase. 0 while inProgress means the phase
   * finished but the next one is attended and waiting for the player.
   */
  readonly ticksRemaining: number;
}

/**
 * Serializable machine state - the source of truth
 * Uses IDs instead of object references so it can be JSON.stringify'd
 */
export interface MachineState {
  readonly machineTypeId: MachineId;
  readonly position: Vector;
  readonly rotation: Direction;
  readonly selectedOperationId: string;
  readonly selectedParameters?: ParameterValues;
  readonly operationProgress: OperationProgress;
  readonly inputMaterials: ReadonlyArray<MaterialInstance>;
  readonly processingMaterials: ReadonlyArray<MaterialInstance>;
  readonly outputMaterials: ReadonlyArray<MaterialInstance>;
  /** Handheld tools mounted at this station (max: type.toolSlots) */
  readonly tools: ReadonlyArray<ToolId>;
}

/**
 * Machine view class - provides convenient access to MachineType and operations
 * Similar to CellMap pattern - a computed view over the raw state
 */
export class Machine {
  readonly state: MachineState;

  constructor(state: MachineState) {
    this.state = state;
  }

  // Computed properties with lookups
  get type(): MachineType {
    const machineType = MACHINE_TYPES[this.state.machineTypeId];
    if (!machineType) {
      throw new Error(`Unknown machine type: ${this.state.machineTypeId}`);
    }
    return machineType;
  }

  /**
   * All operations available at this station: the machine's own plus those
   * of every mounted tool.
   */
  get operations(): ReadonlyArray<MachineOperation | ParameterizedOperation> {
    return [
      ...this.type.operations,
      ...this.state.tools.flatMap((toolId) => TOOL_TYPES[toolId].operations),
    ];
  }

  get selectedOperation(): MachineOperation | ParameterizedOperation {
    const operation = this.selectedOperationOrNull;
    if (!operation) {
      throw new Error(
        `Unknown operation: ${this.state.selectedOperationId} for machine ${this.state.machineTypeId}`,
      );
    }
    return operation;
  }

  /**
   * Like selectedOperation, but null when the id doesn't resolve (e.g. a
   * station whose recipes are all still locked, or "none").
   */
  get selectedOperationOrNull():
    MachineOperation | ParameterizedOperation | null {
    return (
      this.operations.find((op) => op.id === this.state.selectedOperationId) ??
      null
    );
  }

  /** Convert a machine-local cell offset into a shop cell. */
  localToShop(local: Vector): Vector {
    return translateVec(rotateVec(local, this.rotation), this.position);
  }

  /** The shop cell the player stands in to work this machine, or null. */
  get absoluteOperationPosition(): Vector | null {
    const local = this.type.operationPosition;
    if (local === undefined) {
      return null;
    }
    return this.localToShop(local);
  }

  /** The shop cell where this machine's outputs are collected, or null
   * when outputs stay at the machine itself. */
  get absoluteOutputPosition(): Vector | null {
    const local = this.type.outputPosition;
    if (local === undefined) {
      return null;
    }
    return translateVec(rotateVec(local, this.rotation), this.position);
  }

  // Pass-through properties for convenience
  get position(): Vector {
    return this.state.position;
  }

  get rotation(): Direction {
    return this.state.rotation;
  }

  get selectedParameters(): ParameterValues | undefined {
    return this.state.selectedParameters;
  }

  get operationProgress(): OperationProgress {
    return this.state.operationProgress;
  }

  get inputMaterials(): ReadonlyArray<MaterialInstance> {
    return this.state.inputMaterials;
  }

  get processingMaterials(): ReadonlyArray<MaterialInstance> {
    return this.state.processingMaterials;
  }

  get outputMaterials(): ReadonlyArray<MaterialInstance> {
    return this.state.outputMaterials;
  }
}

// Keep computed machines array for game states
const machinesCache = new LRUCache<
  ReadonlyArray<MachineState>,
  ReadonlyArray<Machine>
>({
  maxSize: 100,
});

/**
 * Converts MachineState[] to Machine[] with caching
 * Similar to CellMap.fromGameState pattern
 */
export function getMachines(
  machineStates: ReadonlyArray<MachineState>,
): ReadonlyArray<Machine> {
  if (!machinesCache.has(machineStates)) {
    const machines = machineStates.map((state) => new Machine(state));
    machinesCache.set(machineStates, machines);
  }
  return machinesCache.get(machineStates)!;
}
