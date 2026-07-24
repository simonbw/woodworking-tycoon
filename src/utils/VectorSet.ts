import { Vector, vectorKey } from "../game/Vectors";

export class VectorSet {
  private set: Set<string> = new Set();

  constructor(vectors: ReadonlyArray<Vector> = []) {
    for (const vector of vectors) {
      this.add(vector);
    }
  }

  add(vector: Vector) {
    this.set.add(vectorKey(vector));
  }

  has(vector: Vector) {
    return this.set.has(vectorKey(vector));
  }
}
