/**
 * How the shop writes numbers down.
 *
 * Everything the player reads goes through here rather than `toFixed`, so
 * a four-figure balance reads "$1,024.00" instead of "$1024.00". The
 * thresholds are all reachable: a late-game balance clears four figures,
 * and a level's XP cost passes 1,000 at craft level 10.
 *
 * The formatters are built once and reused. These run inside components
 * that re-render on every tick, and constructing an `Intl.NumberFormat` is
 * far from free.
 *
 * Pair these with `tabular-nums` wherever the number sits in UI chrome — a
 * figure that changes every tick shouldn't reflow the row around it. Prose
 * is the exception: a number inside a sentence should use the same widths
 * as the words around it (see docs/design-system.md).
 */

/** The shop is an American one-car garage; its paperwork is en-US. */
const LOCALE = "en-US";

const MONEY = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "USD",
});

const COUNT = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });

const ONE_DECIMAL = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/**
 * A dollar amount, sign included: `formatMoney(1024)` → `"$1,024.00"`.
 *
 * The `$` comes from the formatter, so call sites must not prefix their
 * own — that was the old `${n.toFixed(2)}` shape and it double-signs here.
 */
export function formatMoney(amount: number): string {
  return MONEY.format(amount);
}

/** A whole number of things: XP, skill points, board feet. */
export function formatCount(value: number): string {
  return COUNT.format(value);
}

/** A one-decimal figure — reputation, and anything else scored in tenths. */
export function formatDecimal(value: number): string {
  return ONE_DECIMAL.format(value);
}
