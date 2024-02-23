import { Vector } from "../game/Vectors";

class VectorSet {
  private set: Set<string> = new Set();

  constructor(vectors: ReadonlyArray<Vector> = []) {
    for (const vector of vectors) {
      this.add(vector);
    }
  }

  add(vector: Vector) {
    this.set.add(vector.join(","));
  }

  has(vector: Vector) {
    return this.set.has(vector.join(","));
  }
}

export function getNeighbors(vector: Vector): Vector[] {
  const [x, y] = vector;
  return [
    [x - 1, y],
    [x + 1, y],
    [x, y - 1],
    [x, y + 1],
  ];
}

export function findPath(
  start: Vector,
  end: Vector,
  obstacles: ReadonlyArray<Vector>
): Vector[] | undefined {
  const obstacleSet = new VectorSet(obstacles);
  const visited = new VectorSet();
  const queue = [start];
  const path = new Map<string, Vector>();
  visited.add(start);

  while (queue.length > 0) {
    const current = queue.shift() as Vector;
    if (current[0] === end[0] && current[1] === end[1]) {
      const result = [current];
      while (path.has(result[0].join(","))) {
        const next = path.get(result[0].join(",")) as Vector;
        result.unshift(next);
      }
      return result;
    }
    for (const neighbor of getNeighbors(current)) {
      if (!visited.has(neighbor) && !obstacleSet.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
        path.set(neighbor.join(","), current);
      }
    }
  }
  return undefined;
}
