import { MaterialInstance } from "./Materials";
import { Direction, Vector } from "./Vectors";

export interface Person {
  name: string;
  position: Vector;
  inventory: ReadonlyArray<MaterialInstance>;

  workQueue: ReadonlyArray<WorkItem>;
  canWork: boolean;
}

export type WorkItem = {
  type: "move";
  direction: Direction;
};
