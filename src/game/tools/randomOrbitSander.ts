import { ToolType } from "../Tool";
import { makeSandingOperations } from "./sanding-operations";

export const randomOrbitSander: ToolType = {
  id: "randomOrbitSander",
  name: "Random Orbit Sander",
  description:
    "The upgrade every arm deserves. Same sanding, a fraction of the time.",
  cost: 80,
  operations: makeSandingOperations("orbit", 12),
};
