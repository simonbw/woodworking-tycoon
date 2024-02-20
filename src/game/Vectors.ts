export type Vector = [number, number];
export type Direction = 0 | 1 | 2 | 3;

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
