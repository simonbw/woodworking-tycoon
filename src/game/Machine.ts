import { MaterialInstance } from "./Materials";
import { Direction, Vector } from "./Vectors";
import { jobsiteTableSaw } from "./machines/jobsiteTableSaw";
import { lunchboxPlaner } from "./machines/lunchboxPlaner";
import { makeshiftBench } from "./machines/makeshiftBench";
import { miterSaw } from "./machines/miterSaw";
import { workspace } from "./machines/workspace";

export interface MachineType {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly operations: ReadonlyArray<MachineOperation>;
  readonly cellsOccupied: ReadonlyArray<Vector>;
  readonly freeCellsNeeded: ReadonlyArray<Vector>;
  readonly operationPosition?: Vector;
  readonly cost: number;
  readonly materialStorage: number;
  readonly toolStorage: number;
  readonly className?: string;
}

export const MACHINE_TYPES = {
  makeshiftBench,
  workspace,
  jobsiteTableSaw,
  miterSaw,
  lunchboxPlaner,
} satisfies { [id: string]: MachineType };
export type MachineId = keyof typeof MACHINE_TYPES;

export interface MachineOperation {
  readonly id: string;
  readonly name: string;
  readonly duration: number;
  readonly inputMaterials: ReadonlyArray<InputMaterialWithQuantity>;
  readonly output: (
    materials: ReadonlyArray<MaterialInstance>
  ) => OperationOutput;
}

export type InputMaterial<T extends MaterialInstance = MaterialInstance> = {
  [K in keyof T]?: ReadonlyArray<T[K]>;
};

export type InputMaterialWithQuantity<
  T extends MaterialInstance = MaterialInstance
> = InputMaterial<T> & {
  readonly quantity: number;
};

export interface OperationOutput {
  inputs: ReadonlyArray<MaterialInstance>;
  outputs: ReadonlyArray<MaterialInstance>;
}

export interface OperationProgress {
  readonly status: "notStarted" | "inProgress" | "finished";
  readonly ticksRemaining: number;
}

export interface Machine {
  readonly type: MachineType;
  readonly position: Vector;
  readonly rotation: Direction;
  readonly selectedOperation: MachineOperation;
  readonly operationProgress: OperationProgress;
  readonly inputMaterials: ReadonlyArray<MaterialInstance>;
  readonly outputMaterials: ReadonlyArray<MaterialInstance>;
}
