import { ToolType } from "../Tool";
import { FINISHING_OPERATIONS } from "./finishing-operations";

/**
 * The cheapest tool on the wall, and the one every product passes under
 * last: finishing is hand work, so it hangs on a bench's rail like the
 * sanding block does. A sanded blank isn't a cutting board until it's
 * been rubbed out, and a cutting board isn't done until it's oiled.
 */
export const finishingKit: ToolType = {
  id: "finishingKit",
  name: "Finishing Kit",
  description:
    "Rags, applicator pads, and a card scraper. Rubs a sanded blank out into a finished board, and wipes the oil on after.",
  cost: 8,
  compatibleMachines: ["workspace", "worktable1x1", "worktable1x2"],
  operations: FINISHING_OPERATIONS,
};
