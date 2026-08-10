import React from "react";

/**
 * The shopping cart, drawn rather than borrowed: a basket on the slant,
 * a push handle, and two wheels. Like the reputation star (see
 * StarIcon.tsx) it sizes itself to the text it sits in (`1em`) and takes
 * its color from it, so the store header's red-when-overdrawn total
 * carries the cart along with the figure.
 *
 * Stroked, not filled — a solid cart at this size turns into a blob, and
 * the store's chrome is line work everywhere else too.
 */
export const CartIcon: React.FC<{
  readonly className?: string;
  /** Screen-reader text; omitted where the label beside it already says "cart". */
  readonly label?: string;
}> = ({ className = "", label }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline-block size-[1.15em] -translate-y-[0.05em] align-middle ${className}`}
    role={label ? "img" : undefined}
    aria-label={label}
    aria-hidden={label ? undefined : true}
  >
    {/* Handle, up over the basket's back corner */}
    <path d="M1.5 3 H4.5 L7.2 14.5" />
    {/* The basket: the front rail runs level, the back leans on the handle */}
    <path d="M6.2 6 H21.5 L19.6 13.2 A1.6 1.6 0 0 1 18 14.5 H7.2" />
    <circle cx="9.5" cy="19.5" r="1.6" />
    <circle cx="17.5" cy="19.5" r="1.6" />
  </svg>
);
