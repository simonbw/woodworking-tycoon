import { ToolType } from "../Tool";
import { makeSandingOperations } from "./sanding-operations";

export const randomOrbitSander: ToolType = {
  id: "randomOrbitSander",
  name: "Random Orbit Sander",
  description:
    "A powered orbital sander. Sands the same surfaces as the block, in roughly a third of the time.",
  cost: 80,
  // A hand tool belongs on a bench, not clamped into a jointer's jig slot.
  compatibleMachines: [
    "workspace",
    "worktable1x1",
    "worktable1x2",
    "worktable1x3",
    "worktable2x2",
  ],
  operations: makeSandingOperations("orbit", 12, {
    // A wider, faster brush — not a multiplier on a bar
    brushWidthIn: 5,
    coveragePerSecond: 50,
  }),
};
