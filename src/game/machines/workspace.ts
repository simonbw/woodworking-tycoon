import { MachineType } from "../Machine";
import { BENCH_OPERATIONS } from "./benchOperations";
import { GENERATED_COLLISION_BOXES } from "../machine-collision-boxes.generated";

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
  // Plywood over paint buckets: about 31" × 21", so a 3×2-ft footprint
  // with the front edge overhanging toward whoever's working at it (see
  // the measured collision box).
  cellsOccupied: [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [0, 0],
    [1, 0],
  ],
  collisionBox: GENERATED_COLLISION_BOXES.workspace,
  freeCellsNeeded: [
    [0, 1],
    [0, 2],
  ],
  operationPosition: [0, 2],
  cost: 0,
  materialStorage: 0,
  // Two slots: the starter hammer plus room for a sander
  toolSlots: 2,
  inputSpaces: 5,
  operations: BENCH_OPERATIONS,
};
