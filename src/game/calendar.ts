/**
 * The shop's calendar: turning the day counter into a date.
 *
 * `GameState.day` counts mornings from the start of the save and is what
 * every rule is written against (see `time.ts`). A date is presentation on
 * top of that — the top bar's dial reads "JUN 9" rather than "DAY 1"
 * because a date is a thing a person in a shop would actually say, and it
 * gives the season some ground to stand on.
 *
 * Nothing is stored: the date is derived from `day` every time, so a save
 * carries no calendar of its own and there is nothing to migrate.
 */

/**
 * Day 1 of every shop: Monday, 9 June 2025. Early summer, arbitrarily but
 * deliberately chosen — long evenings for the daylight the shop is lit by,
 * and a Monday, so the first day of the save is the first day of a week
 * even though nothing reads weekdays yet.
 *
 * The year is never shown. It exists only so month lengths (and the odd
 * leap year, for a shop that runs long enough to reach one) come out right.
 */
const FIRST_DAY_UTC = Date.UTC(2025, 5, 9);

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Month abbreviations, spelled the way a shop calendar would. Deliberately
 * not `toLocaleDateString`: the game's typography is fixed English and the
 * top bar's dial is sized against three letters, so a locale that renders
 * "juin" or "6月" would break the layout rather than help anybody.
 */
const MONTH_NAMES = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
] as const;

/**
 * The calendar date of a given shop day, as a UTC `Date`. UTC throughout so
 * the shop's calendar is the same everywhere — a player in Auckland and one
 * in Los Angeles are on the same day of the same save.
 */
export function dateForDay(day: number): Date {
  return new Date(FIRST_DAY_UTC + (day - 1) * MS_PER_DAY);
}

/** The date as one string: `"JUN 9"`, `"AUG 6"`. */
export function formatShopDate(day: number): string {
  const { month, dayOfMonth } = shopDateParts(day);
  return `${month} ${dayOfMonth}`;
}

/**
 * The same date split in two, for the top bar's dial, which stacks the
 * month over the day the way a desk calendar's page does — that shape fits
 * inside the sun's orbit where one long line would not.
 */
export function shopDateParts(day: number): {
  month: string;
  dayOfMonth: number;
} {
  const date = dateForDay(day);
  return {
    month: MONTH_NAMES[date.getUTCMonth()],
    dayOfMonth: date.getUTCDate(),
  };
}
