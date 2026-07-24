export type Vector = [number, number];

export type Direction = 0 | 1 | 2 | 3;

export function invertDirection(direction: Direction): Direction {
  switch (direction) {
    case 0:
      return 2;
    case 1:
      return 3;
    case 2:
      return 0;
    case 3:
      return 1;
  }
}

export function directionToAngle(direction: Direction): number {
  return 360 - direction * 90;
}

export function rotateVec([x, y]: Vector, rotation: Direction): Vector {
  switch (rotation) {
    case 0:
      return [x, y];
    case 1:
      return [y, -x];
    case 2:
      return [-x, -y];
    case 3:
      return [-y, x];
  }
}

export function translateVec([x, y]: Vector, [dx, dy]: Vector): Vector {
  return [x + dx, y + dy];
}

export function scaleVec([x, y]: Vector, scalar: number): Vector {
  return [x * scalar, y * scalar];
}

export function vectorEquals(a: Vector, b: Vector): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

/**
 * The canonical "x,y" string key for a Vector, for use in Maps, Sets, and
 * Records (DustMap, CellMap, pathfinding, render keys). Every cell-keyed
 * structure shares this one encoding — never hand-roll `join(",")`.
 */
export function vectorKey([x, y]: Vector): string {
  return `${x},${y}`;
}

/** Inverse of vectorKey. */
export function keyToVector(key: string): Vector {
  const [x, y] = key.split(",").map(Number);
  return [x, y];
}

/** Chessboard distance in cells — 0 is the same cell, 1 is any neighbor. */
export function chebyshevDistance(a: Vector, b: Vector): number {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
}

export function localToGlobal(
  origin: Vector,
  local: Vector,
  rotation: Direction = 0,
): Vector {
  return translateVec(rotateVec(local, rotation), origin);
}
