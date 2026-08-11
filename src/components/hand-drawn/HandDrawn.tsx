import React, { useMemo } from "react";
import { classNames } from "../../utils/classNames";
import { seededRandom } from "../../utils/randUtils";

/**
 * Marks drawn by hand rather than set by the browser: the rules, boxes,
 * ticks, crossings-out, and key caps on the character's own paperwork.
 *
 * A border-bottom is a machine-straight line, and a `line-through` is a
 * machine-straight line through the middle of a word — both read as
 * chrome no matter what face the text is in. Everything here is an SVG
 * path whose points wander a little off true, drawn with a round cap and
 * a slight overshoot at the corners the way a pen leaves them.
 *
 * The wander comes from a seeded generator keyed on whatever the caller
 * passes as `seed` (a step id, a key name), so a given mark looks the
 * same every render and two marks next to each other look different.
 * Pass nothing and every instance shares one hand.
 *
 * The paths draw at a nominal viewBox size and stretch to the element
 * (`preserveAspectRatio="none"` where the mark spans text), so the
 * stroke keeps its weight while the mark takes whatever width it lands
 * in. Everything is `currentColor`: a mark is written in whatever the
 * surrounding hand is holding.
 */

/** A wander generator: `wobble(amount)` returns ±amount, deterministically. */
function makeHand(seed: string | number | undefined) {
  const rand = seededRandom(seed ?? "hand");
  return (amount: number) => (rand() * 2 - 1) * amount;
}

/**
 * A ruled line under a heading or between blocks — one pass of a pen
 * along a straightedge that wasn't quite held down, with the ends
 * tapering as the hand lifts.
 */
export const HandRule: React.FC<{
  seed?: string | number;
  className?: string;
  /** Stroke weight, in device pixels (the stroke doesn't stretch). */
  weight?: number;
}> = ({ seed, className, weight = 1.4 }) => {
  const d = useMemo(() => {
    const wobble = makeHand(seed);
    const points: string[] = [];
    // Even, so the points after the first pair up into whole Q segments.
    const steps = 8;
    for (let i = 0; i <= steps; i++) {
      const x = 1 + (98 * i) / steps + wobble(1.5);
      const y = 4 + wobble(1.7);
      points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
    }
    return `M ${points[0]} Q ${points.slice(1).join(" ")}`;
  }, [seed]);

  return (
    <svg
      aria-hidden
      viewBox="0 0 100 8"
      preserveAspectRatio="none"
      className={classNames("block h-[8px] w-full", className)}
    >
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={weight}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
};

/**
 * An empty box, drawn as four separate strokes that overshoot at the
 * corners — a pen lifts between sides, so the corners cross rather than
 * meet.
 */
export const HandCheckbox: React.FC<{
  seed?: string | number;
  className?: string;
}> = ({ seed, className }) => {
  const d = useMemo(() => {
    const wobble = makeHand(seed);
    const p = (x: number, y: number) =>
      `${(x + wobble(1.1)).toFixed(2)},${(y + wobble(1.1)).toFixed(2)}`;
    // Each side drawn on its own, bowing a little and running past its
    // corner: the pen lifts between sides, so they cross rather than meet.
    const side = (
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      bow: number,
    ) =>
      `M ${p(x1, y1)} Q ${p(
        (x1 + x2) / 2 + bow,
        (y1 + y2) / 2 + bow,
      )} ${p(x2, y2)}`;
    return [
      side(3.5, 4.5, 19.5, 3.5, 0.5),
      side(20, 4, 19, 19.5, -0.6),
      side(19.5, 19, 3.5, 20, 0.5),
      side(4, 19.5, 3, 4, -0.5),
    ].join(" ");
  }, [seed]);

  return (
    <svg
      aria-hidden
      viewBox="0 0 23 23"
      className={classNames("h-[1.05em] w-[1.05em] flex-none", className)}
    >
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
      />
    </svg>
  );
};

/**
 * The tick that lands in the box: one short down-stroke into one long
 * up-stroke, running past the box's corner the way a checkmark does when
 * it's meant rather than typed.
 */
export const HandCheck: React.FC<{
  seed?: string | number;
  className?: string;
}> = ({ seed, className }) => {
  const d = useMemo(() => {
    const wobble = makeHand(seed);
    const p = (x: number, y: number) =>
      `${(x + wobble(0.9)).toFixed(2)},${(y + wobble(0.9)).toFixed(2)}`;
    // Down into the corner, then the long stroke up past the top right.
    return (
      `M ${p(2, 10)} Q ${p(5.5, 14.5)} ${p(9, 19)}` +
      ` Q ${p(14, 10)} ${p(22, 0.5)}`
    );
  }, [seed]);

  return (
    <svg
      aria-hidden
      viewBox="0 0 23 23"
      className={classNames("h-[1.15em] w-[1.15em] flex-none", className)}
    >
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

/**
 * A line crossed through finished work: drawn across the words at a
 * slight angle, sagging in the middle, with a little run-out past both
 * ends. Absolutely positioned, so the caller is a `relative` wrapper
 * around the text it crosses.
 */
export const HandStrike: React.FC<{
  seed?: string | number;
  className?: string;
}> = ({ seed, className }) => {
  const d = useMemo(() => {
    const wobble = makeHand(seed);
    const y0 = 5 + wobble(1.2);
    const y1 = 5 + wobble(1.2);
    const sag = 5.5 + wobble(1.4);
    return `M ${(-1.5).toFixed(2)},${y0.toFixed(2)} Q 50,${sag.toFixed(
      2,
    )} 101.5,${y1.toFixed(2)}`;
  }, [seed]);

  return (
    <svg
      aria-hidden
      viewBox="0 0 100 10"
      preserveAspectRatio="none"
      className={classNames(
        "pointer-events-none absolute inset-x-0 top-[0.55em] h-[0.5em] w-full",
        className,
      )}
    >
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
};

/**
 * A box drawn around something on the page — a key cap sketched in the
 * margin rather than a rendered one. Same lifted-pen corners as
 * {@link HandCheckbox}, stretched to whatever it wraps. The horizontal
 * wander is the larger of the two because the drawing space is squeezed
 * far harder across than down: a cap is a few times wider than it is
 * tall in this 100×40 space but only ~2× on screen.
 */
export const HandFrame: React.FC<{
  seed?: string | number;
  className?: string;
}> = ({ seed, className }) => {
  const d = useMemo(() => {
    const wobble = makeHand(seed);
    const p = (x: number, y: number) =>
      `${(x + wobble(6)).toFixed(2)},${(y + wobble(2.4)).toFixed(2)}`;
    const side = (
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      bowY: number,
    ) =>
      `M ${p(x1, y1)} Q ${p((x1 + x2) / 2, (y1 + y2) / 2 + bowY)} ${p(x2, y2)}`;
    return [
      side(3, 5, 97, 3.5, 1.2),
      side(98, 4, 96, 36, 0),
      side(97, 35.5, 3, 37, -1.2),
      side(4, 36, 2, 4, 0),
    ].join(" ");
  }, [seed]);

  return (
    <svg
      aria-hidden
      viewBox="0 0 100 40"
      preserveAspectRatio="none"
      className={classNames("absolute inset-0 h-full w-full", className)}
    >
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.9}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
};
