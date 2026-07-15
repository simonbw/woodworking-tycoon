import { MachineOperation } from "./Machine";
import { randomOrbitSander } from "./tools/randomOrbitSander";
import { sandingBlock } from "./tools/sandingBlock";

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
  readonly operations: ReadonlyArray<MachineOperation>;
}

export const TOOL_TYPES = {
  sandingBlock,
  randomOrbitSander,
} satisfies { [id: string]: ToolType };

export type ToolId = keyof typeof TOOL_TYPES;
