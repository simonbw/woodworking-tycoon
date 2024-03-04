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

export function localToGlobal(
  origin: Vector,
  local: Vector,
  rotation: Direction = 0
): Vector {
  return translateVec(rotateVec(local, rotation), origin);
}
