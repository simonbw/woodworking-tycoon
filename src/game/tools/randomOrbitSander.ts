import { ToolType } from "../Tool";
import { makeSandingOperations } from "./sanding-operations";

export const randomOrbitSander: ToolType = {
  id: "randomOrbitSander",
  name: "Random Orbit Sander",
  description:
    "A powered orbital sander. Sands the same surfaces as the block, in roughly a third of the time.",
  cost: 80,
  // A hand tool belongs on a bench, not clamped into a jointer's jig slot.
  compatibleMachines: ["workspace", "worktable1x1", "worktable1x2"],
  operations: makeSandingOperations("orbit", 12, {
    // A wider, faster brush — not a multiplier on a bar. And it's a
    // power tool: the pad orbits by itself, so it keeps cutting while
    // it rests on a spot — the block only cuts while it moves.
    brushWidthIn: 5,
    coveragePerSecond: 50,
    powered: true,
  }),
};
