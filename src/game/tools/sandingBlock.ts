import { ToolType } from "../Tool";
import { makeSandingOperations } from "./sanding-operations";

export const sandingBlock: ToolType = {
  id: "sandingBlock",
  name: "Sanding Block",
  description:
    "A cork block and a stack of sandpaper. Slow, honest work — your arm is the motor.",
  cost: 10,
  operations: makeSandingOperations("block", 40),
};
