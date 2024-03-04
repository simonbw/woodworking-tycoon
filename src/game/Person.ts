import { Machine } from "./Machine";
import { MaterialInstance } from "./Materials";
import { Direction, Vector } from "./Vectors";

export interface Person {
  name: string;
  position: Vector;
  direction: Direction;
  inventory: ReadonlyArray<MaterialInstance>;
  currentMachine: Machine | null;
  workQueue: ReadonlyArray<WorkItem>;
  canWork: boolean;
}

export type WorkItem = {
  type: "move";
  direction: Direction;
};
