import type { MachineId, Operation } from "./Machine";
import { circularSaw } from "./tools/circularSaw";
import { crosscutSled } from "./tools/crosscutSled";
import { drill } from "./tools/drill";
import { dustBag } from "./tools/dustBag";
import { finishingKit } from "./tools/finishingKit";
import { hammer } from "./tools/hammer";
import { handPlane } from "./tools/handPlane";
import { handSaw } from "./tools/handSaw";
import { randomOrbitSander } from "./tools/randomOrbitSander";
import { sandingBlock } from "./tools/sandingBlock";
import { straightLineSled } from "./tools/straightLineSled";

/**
 * A handheld tool. Tools mount into a workstation's tool slots
 * (MachineType.toolSlots), and while mounted they add their operations to
 * that station's operation list. An unmounted tool is a physical object —
 * a MaterialInstance of kind "tool" (see Materials.ts) — carried in the
 * arms, set down in piles, and hauled home in the truck's bed.
 *
 * See docs/tools-and-surfaces.md for the system's design rules.
 */
export interface ToolType {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly cost: number;
  /**
   * Shop-made tooling: never sold in the store, only produced by a recipe
   * (see OperationOutput.toolOutputs).
   */
  readonly craftedOnly?: boolean;
  /**
   * Machines this tool can mount on. Absent means any station with a free
   * tool slot — right for sanders, wrong for a crosscut sled.
   */
  readonly compatibleMachines?: ReadonlyArray<MachineId>;
  readonly operations: ReadonlyArray<Operation>;
}

export const TOOL_TYPES = {
  hammer,
  handSaw,
  drill,
  sandingBlock,
  randomOrbitSander,
  finishingKit,
  handPlane,
  circularSaw,
  crosscutSled,
  straightLineSled,
  dustBag,
} satisfies { [id: string]: ToolType };

export type ToolId = keyof typeof TOOL_TYPES;
