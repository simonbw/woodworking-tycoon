import { ToolType } from "../Tool";

/**
 * How much faster screw-driving recipes run where the impact driver
 * backs up the drill. Applied through Machine.workSpeedFor, so it only
 * ever helps operations that actually consume screws.
 */
export const IMPACT_DRIVER_SPEED_FACTOR = 1.5;

/**
 * The drill's companion, not its replacement. No operations of its own —
 * screwed assembly stays a drill trade — but mounted at the same station
 * as the drill it speeds those recipes up: one tool wears the drill bit
 * for pilot holes while the other wears the driver bit, so nobody swaps
 * bits mid-build. The dust bag walked this path first (a tool whose whole
 * effect is passive); this is the first tool whose effect is another tool.
 */
export const impactDriver: ToolType = {
  id: "impactDriver",
  name: "Impact Driver",
  description:
    "A cordless impact driver. Mounted beside the drill it speeds up " +
    "screwed assembly — one drills pilots, the other drives, no bit swaps.",
  cost: 90,
  // Same benches as the drill it partners with
  compatibleMachines: [
    "workspace",
    "worktable1x1",
    "worktable1x2",
    "worktable1x3",
    "worktable2x2",
  ],
  operations: [],
};
