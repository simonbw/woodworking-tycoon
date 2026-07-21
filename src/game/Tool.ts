import type {
  MachineId,
  MachineOperation,
  ParameterizedOperation,
} from "./Machine";
import { crosscutSled } from "./tools/crosscutSled";
import { drill } from "./tools/drill";
import { dustBag } from "./tools/dustBag";
import { hammer } from "./tools/hammer";
import { handPlane } from "./tools/handPlane";
import { handSaw } from "./tools/handSaw";
import { randomOrbitSander } from "./tools/randomOrbitSander";
import { sandingBlock } from "./tools/sandingBlock";
import { straightLineSled } from "./tools/straightLineSled";

/**
 * A handheld tool. Tools aren't placed in the shop like machines — they
 * mount into a workstation's tool slots (MachineType.toolSlots), and while
 * mounted they add their operations to that station's operation list.
 * Unmounted tools live in GameState.storage.tools.
 *
 * See docs/tools-and-surfaces.md for where this system is headed.
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
  readonly operations: ReadonlyArray<MachineOperation | ParameterizedOperation>;
}

export const TOOL_TYPES = {
  hammer,
  handSaw,
  drill,
  sandingBlock,
  randomOrbitSander,
  handPlane,
  crosscutSled,
  straightLineSled,
  dustBag,
} satisfies { [id: string]: ToolType };

export type ToolId = keyof typeof TOOL_TYPES;
