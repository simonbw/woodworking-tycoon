import { MaterialInstance } from "./Materials";
import { Vector } from "./Vectors";

export interface Person {
  name: string;
  position: Vector;
  inventory: ReadonlyArray<MaterialInstance>;
}
