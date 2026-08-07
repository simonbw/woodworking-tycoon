/**
 * How many ticks make a working day — the budget of minutes between the
 * 7 AM open and the 5 PM close. Spending them is the game: work, trips,
 * and waiting all draw the day down; walking and thinking barely do
 * (see time-flow.ts). When they're gone the shop is closed for
 * the night and the only way forward is driving home.
 */
export const TICKS_PER_DAY = 600;

/**
 * The overnight, 5 PM back around to 7 AM: fourteen hours of minutes,
 * run as one batch of ordinary ticks while the player sleeps. Glue
 * cures, listings sell, demand recovers — everything that happens
 * overnight happens because the tick pipeline says so.
 */
export const NIGHT_TICKS = 840;

/**
 * A full calendar day of shop time, wall-clock: the working day plus the
 * night. Anything the marketplace quotes "in days" — offer lifetimes,
 * pity timers, demand recovery — is denominated in this, so "three days"
 * still means three mornings from now even though most of those ticks
 * pass in overnight batches.
 */
export const TICKS_PER_CALENDAR_DAY = TICKS_PER_DAY + NIGHT_TICKS;

/**
 * One tick is one minute on the shop clock, so a day is 600 minutes — a
 * ten-hour working day, 7:00 AM to 5:00 PM. Every duration in the game is a
 * whole number of ticks (`getOperationPhases` rounds each modifier), so this
 * mapping never leaves the player a fraction of a minute to read.
 *
 * Ticks are the simulation's unit and stay in the code; minutes and hours are
 * what the player sees. Anything rendering a span of time goes through
 * `formatDuration`; moments are told only as broadly as `dayPhase`.
 */
export const MINUTES_PER_TICK = 1;

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = TICKS_PER_DAY * MINUTES_PER_TICK;

/**
 * A span of ticks as shop time: "8 min", "1h 05m", "2h 30m", "1d 4h".
 * Whole units are left bare ("1h", not "1h 00m") so the common cases read
 * like something a woodworker would say out loud.
 */
export function formatDuration(ticks: number): string {
  const minutes = Math.max(0, Math.round(ticks * MINUTES_PER_TICK));

  if (minutes >= MINUTES_PER_DAY) {
    const days = Math.floor(minutes / MINUTES_PER_DAY);
    const hours = Math.floor((minutes % MINUTES_PER_DAY) / MINUTES_PER_HOUR);
    return hours === 0 ? `${days}d` : `${days}d ${hours}h`;
  }
  if (minutes >= MINUTES_PER_HOUR) {
    const hours = Math.floor(minutes / MINUTES_PER_HOUR);
    const rest = minutes % MINUTES_PER_HOUR;
    return rest === 0
      ? `${hours}h`
      : `${hours}h ${String(rest).padStart(2, "0")}m`;
  }
  return `${minutes} min`;
}

/**
 * Where the day stands, told the way someone glancing at the light
 * through the garage door would tell it — there is deliberately no wall
 * clock. "night" is the closed shop: nothing new starts, and time only
 * passes to finish what's already running.
 */
export type DayPhase = "morning" | "midday" | "afternoon" | "evening" | "night";

/** The phase of the day after `dayTicks` of it have been spent. */
export function dayPhase(dayTicks: number): DayPhase {
  if (dayTicks >= TICKS_PER_DAY) return "night";
  if (dayTicks >= TICKS_PER_DAY * 0.75) return "evening";
  if (dayTicks >= TICKS_PER_DAY * 0.5) return "afternoon";
  if (dayTicks >= TICKS_PER_DAY * 0.25) return "midday";
  return "morning";
}
