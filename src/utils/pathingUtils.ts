import {
  Direction,
  Vector,
  rotateVec,
  translateVec,
  vectorEquals,
} from "../game/Vectors";
import { VectorSet } from "./VectorSet";

export function getNeighbors(
  position: Vector,
): { direction: Direction; position: Vector }[] {
  const directions: Direction[] = [0, 1, 2, 3];
  return directions.map((direction) => ({
    direction,
    position: translateVec(position, rotateVec([1, 0], direction)),
  }));
}

type PathItem = { direction: Direction; position: Vector };
type Path = PathItem[];

function vecToKey(vec: Vector): string {
  return vec.join(",");
}

// A simple breadth-first search to find a path from start to end
export function findPath(
  start: Vector,
  end: Vector,
  validCells: ReadonlyArray<Vector>,
): Path | undefined {
  const validSet = new VectorSet(validCells);
  const visited = new VectorSet();
  const queue: PathItem[] = [{ position: start, direction: 0 }];
  const path = new Map<string, PathItem>();
  visited.add(start);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (vectorEquals(current.position, end)) {
      const result: Path = [current];
      while (path.has(vecToKey(result[0].position))) {
        const next = path.get(vecToKey(result[0].position))!;
        result.unshift(next);
      }
      result.shift();
      return result;
    }

    for (const pathItem of getNeighbors(current.position)) {
      if (!visited.has(pathItem.position) && validSet.has(pathItem.position)) {
        visited.add(pathItem.position);
        queue.push(pathItem);
        path.set(vecToKey(pathItem.position), current);
      }
    }
  }

  return undefined;
}
