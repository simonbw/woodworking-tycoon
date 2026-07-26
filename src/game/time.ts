/**
 * How many ticks make an in-game day. The Ticker's calendar strip renders it,
 * and the marketplace runs on it: sale pity timers, job-offer lifetimes, and
 * the daily job-board refresh are all expressed in days.
 */
export const TICKS_PER_DAY = 600;

/**
 * One tick is one minute on the shop clock, so a day is 600 minutes — a
 * ten-hour working day, 7:00 AM to 5:00 PM. Every duration in the game is a
 * whole number of ticks (`getOperationPhases` rounds each modifier), so this
 * mapping never leaves the player a fraction of a minute to read.
 *
 * Ticks are the simulation's unit and stay in the code; minutes and hours are
 * what the player sees. Anything rendering a span of time goes through
 * `formatDuration`, and anything rendering a moment goes through `formatClock`.
 */
export const MINUTES_PER_TICK = 1;

/** The hour the shop day starts on, in 24h form. Ends ten hours later, at 5 PM. */
export const DAY_START_HOUR = 7;

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

/** Which day the shop is on, counting from 1. */
export function dayNumber(tick: number): number {
  return Math.floor(tick / TICKS_PER_DAY) + 1;
}

/**
 * The moment on the shop's wall clock: "7:00 AM" at the start of a day
 * through "4:59 PM" at the end of it.
 */
export function formatClock(tick: number): string {
  const minuteOfDay =
    (((tick % TICKS_PER_DAY) + TICKS_PER_DAY) % TICKS_PER_DAY) *
    MINUTES_PER_TICK;
  const hour24 = DAY_START_HOUR + Math.floor(minuteOfDay / MINUTES_PER_HOUR);
  const minute = minuteOfDay % MINUTES_PER_HOUR;
  const suffix = hour24 % 24 < 12 ? "AM" : "PM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}
