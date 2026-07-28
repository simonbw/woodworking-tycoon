import React from "react";

/**
 * The shop's reputation mark, and the spark that stands for XP.
 *
 * These were both literal glyphs once (★ U+2605, ✦ U+2726), which meant
 * they rendered in whatever face the browser fell back to: no web font we
 * ship carries either character — the latin subset stops well short of
 * them — so a mark that appears next to the figures in the top bar
 * and inside `font-stencil` type on the title screen was drawn by three
 * different system fonts depending on the machine, at three different
 * weights and baselines. Drawing them ourselves makes the mark the same
 * shape everywhere and takes it off the font stack entirely.
 *
 * Both size themselves to the text they sit in (`1em`) and take their
 * color from it (`currentColor`), so the existing `text-gold` /
 * `text-gold-dark` classes at each site keep working untouched. The
 * baseline nudge is what a real glyph would have had built in: an SVG box
 * sits on the baseline by default, which rides visibly high next to digits.
 */

interface MarkProps {
  /** Extra classes for the sites that size or color the mark themselves. */
  readonly className?: string;
  /**
   * Screen-reader text. Omitted by default: most of these sit beside a
   * number that already reads correctly ("Reputation 2.0"), and a star
   * announced on every one would be noise.
   */
  readonly label?: string;
}

/** Shared box: square, 1em tall, sitting where a glyph would sit. */
const markProps = {
  viewBox: "0 0 24 24",
  fill: "currentColor",
  className: "inline-block size-[1em] -translate-y-[0.075em] align-middle",
} as const;

/** Reputation. Five points, the shape the ★ glyph used to stand in for. */
export const StarIcon: React.FC<MarkProps> = ({ className = "", label }) => (
  <svg
    {...markProps}
    className={`${markProps.className} ${className}`}
    role={label ? "img" : undefined}
    aria-label={label}
    aria-hidden={label ? undefined : true}
  >
    <path d="M12.00 1.00 L14.70 8.28 L22.46 8.60 L16.37 13.42 L18.47 20.90 L12.00 16.60 L5.53 20.90 L7.63 13.42 L1.54 8.60 L9.30 8.28 Z" />
  </svg>
);

/** XP. Four points, deliberately sharper than the reputation star. */
export const SparkIcon: React.FC<MarkProps> = ({ className = "", label }) => (
  <svg
    {...markProps}
    className={`${markProps.className} ${className}`}
    role={label ? "img" : undefined}
    aria-label={label}
    aria-hidden={label ? undefined : true}
  >
    <path d="M12.00 1.00 L14.19 9.81 L23.00 12.00 L14.19 14.19 L12.00 23.00 L9.81 14.19 L1.00 12.00 L9.81 9.81 Z" />
  </svg>
);
