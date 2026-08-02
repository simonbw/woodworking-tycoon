import { ToolType } from "../Tool";
import { makeSandingOperations } from "./sanding-operations";

export const sandingBlock: ToolType = {
  id: "sandingBlock",
  name: "Sanding Block",
  description: "A cork block and sandpaper. Sands a surface smooth by hand.",
  cost: 10,
  // A hand tool belongs on a bench, not clamped into a jointer's jig slot.
  compatibleMachines: [
    "workspace",
    "worktable1x1",
    "worktable1x2",
    "worktable1x3",
    "worktable2x2",
  ],
  operations: makeSandingOperations("block", 40),
};
