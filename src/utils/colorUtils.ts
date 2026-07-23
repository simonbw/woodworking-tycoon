/** Parse a color ("#B1754A" or 0xb1754a) into [r, g, b] bytes. */
export function colorToRgb(color: string | number): [number, number, number] {
  const n =
    typeof color === "number" ? color : parseInt(color.replace("#", ""), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** Normalize a color ("#B1754A" or 0xb1754a) to a PIXI color number. */
export function colorToNumber(color: string | number): number {
  return typeof color === "number"
    ? color
    : parseInt(color.replace("#", ""), 16);
}

/** Format a color ("#B1754A" or 0xb1754a) as a CSS hex string. */
export function colorToCss(color: string | number): string {
  return `#${colorToNumber(color).toString(16).padStart(6, "0")}`;
}

/** Blend `a` toward `b` by `t` (0 = all a, 1 = all b), as a PIXI color number. */
export function mixColors(
  a: string | number,
  b: string | number,
  t: number,
): number {
  const [ar, ag, ab] = colorToRgb(a);
  const [br, bg, bb] = colorToRgb(b);
  return (
    (Math.round(ar + (br - ar) * t) << 16) |
    (Math.round(ag + (bg - ag) * t) << 8) |
    Math.round(ab + (bb - ab) * t)
  );
}
