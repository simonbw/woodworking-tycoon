import { MaterialInstance } from "./Materials";
import { Direction, Vector } from "./Vectors";
import { garbageCan } from "./machines/garbageCan";
import { jobsiteTableSaw } from "./machines/jobsiteTableSaw";
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
  readonly cost: number;
  readonly materialStorage: number;
  readonly toolStorage: number;
  readonly className?: string;
  readonly inputSpaces: number;
}

export const MACHINE_TYPES = {
  makeshiftBench,
  workspace,
  jobsiteTableSaw,
  miterSaw,
  lunchboxPlaner,
  garbageCan,
} satisfies { [id: string]: MachineType };
export type MachineId = keyof typeof MACHINE_TYPES;

export interface MachineOperation {
  readonly id: string;
  readonly name: string;
  readonly duration: number;
  readonly inputMaterials: ReadonlyArray<InputMaterialWithQuantity>;
  readonly output: (
    materials: ReadonlyArray<MaterialInstance>,
  ) => OperationOutput;
}

export type InputMaterial<T extends MaterialInstance = MaterialInstance> = {
  [K in keyof T]?: ReadonlyArray<T[K]>;
};

export type InputMaterialWithQuantity<
  T extends MaterialInstance = MaterialInstance,
> = InputMaterial<T> & {
  readonly quantity: number;
};

export interface OperationOutput {
  inputs: ReadonlyArray<MaterialInstance>;
  outputs: ReadonlyArray<MaterialInstance>;
}

// Parameterized operation system
export interface OperationParameter<T = number | string> {
  readonly id: string;
  readonly name: string;
  readonly values: ReadonlyArray<T>;
}

export type ParameterValues = Record<string, number | string>;

export interface ParameterizedOperation<
  TParams extends ParameterValues = ParameterValues,
> {
  readonly id: string;
  readonly name: string;
  readonly duration: number;
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
}

/**
 * Machine view class - provides convenient access to MachineType and operations
 * Similar to CellMap pattern - a computed view over the raw state
 */
export class Machine {
  constructor(private readonly state: MachineState) {}

  // Computed properties with lookups
  get type(): MachineType {
    const machineType = MACHINE_TYPES[this.state.machineTypeId];
    if (!machineType) {
      throw new Error(`Unknown machine type: ${this.state.machineTypeId}`);
    }
    return machineType;
  }

  get selectedOperation(): MachineOperation | ParameterizedOperation {
    const operation = this.type.operations.find(
      (op) => op.id === this.state.selectedOperationId,
    );
    if (!operation) {
      throw new Error(
        `Unknown operation: ${this.state.selectedOperationId} for machine ${this.state.machineTypeId}`,
      );
    }
    return operation;
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

  // Access to underlying state for game actions
  toState(): MachineState {
    return this.state;
  }
}
