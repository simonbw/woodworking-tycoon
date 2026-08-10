import { MachineType } from "../Machine";
import { BENCH_OPERATIONS } from "./benchOperations";
import { GENERATED_COLLISION_SHAPES } from "../machine-collision-boxes.generated";

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
  // A 40" × 30" sheet of plywood over three paint buckets that stick out
  // past it on every side — call the whole thing 4×3 ft of floor, which
  // is what the art measures and what the collision box is cut from.
  cellsOccupied: [
    [-1, -2],
    [0, -2],
    [1, -2],
    [2, -2],
    [-1, -1],
    [0, -1],
    [1, -1],
    [2, -1],
    [-1, 0],
    [0, 0],
    [1, 0],
    [2, 0],
  ],
  // Only the plywood takes stock; the buckets underneath are not bench
  benchTopIn: { widthIn: 40, heightIn: 30 },
  collisionShapes: GENERATED_COLLISION_SHAPES.workspace,
  // Two feet of room to stand and work, and the operator stands at the
  // near one — right up against the plywood, where hands reach it.
  freeCellsNeeded: [
    [0, 1],
    [0, 2],
  ],
  operationPosition: [0, 1],
  cost: 0,
  materialStorage: 0,
  // Two slots: the starter hammer plus room for a sander
  toolSlots: 2,
  // A bench top holds stock, not bays: generous enough for the widest
  // blueprint build (the crate's ten boards) with room to shuffle
  inputSpaces: 12,
  operations: BENCH_OPERATIONS,
};
