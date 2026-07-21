import { MachineType } from "../Machine";
import { BENCH_OPERATIONS } from "./benchOperations";

export { GLUE_CURE_TICKS } from "./benchOperations";

/**
 * The station every shop starts with: a plywood offcut across a few paint
 * buckets. It knows every bench recipe — a real worktable doesn't unlock
 * work, it runs the attended parts faster and adds tool slots and a shelf.
 * Never sold; the id stays "workspace" for save compatibility.
 */
export const workspace: MachineType = {
  id: "workspace",
  name: "Makeshift Workbench",
  description:
    "A plywood offcut over a few paint buckets. It wobbles, but it works.",
  cellsOccupied: [[0, 0]],
  freeCellsNeeded: [[0, 1]],
  operationPosition: [0, 1],
  cost: 0,
  materialStorage: 0,
  // Two slots: the starter hammer plus room for a sander
  toolSlots: 2,
  inputSpaces: 5,
  operations: BENCH_OPERATIONS,
};
