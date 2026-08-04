import assert from "node:assert";
import { describe, it } from "node:test";
import { SCAVENGE_DURATION_TICKS } from "./game-actions/scavenge-actions";
import { GLUE_CURE_TICKS } from "./machines/benchOperations";
import {
  dayPhase,
  formatDuration,
  NIGHT_TICKS,
  TICKS_PER_CALENDAR_DAY,
  TICKS_PER_DAY,
} from "./time";

describe("formatDuration", () => {
  it("reads a short span in minutes", () => {
    assert.equal(formatDuration(8), "8 min");
  });

  it("stays in minutes right up to the hour", () => {
    assert.equal(formatDuration(59), "59 min");
  });

  it("drops the minutes on a whole hour", () => {
    assert.equal(formatDuration(60), "1h");
  });

  it("pads the minutes past an hour", () => {
    assert.equal(formatDuration(61), "1h 01m");
  });

  it("reads a whole day as a day", () => {
    assert.equal(formatDuration(TICKS_PER_DAY), "1d");
  });

  it("carries hours alongside days", () => {
    assert.equal(formatDuration(TICKS_PER_DAY + 60), "1d 1h");
  });

  it("shows nothing negative", () => {
    assert.equal(formatDuration(-5), "0 min");
  });

  it("puts a glue cure at an hour", () => {
    assert.equal(formatDuration(GLUE_CURE_TICKS), "1h");
  });

  it("puts a scavenging trip at two and a half hours", () => {
    assert.equal(formatDuration(SCAVENGE_DURATION_TICKS), "2h 30m");
  });
});

describe("dayPhase", () => {
  it("opens the day in the morning", () => {
    assert.equal(dayPhase(0), "morning");
  });

  it("crosses into midday a quarter of the way through", () => {
    assert.equal(dayPhase(TICKS_PER_DAY / 4), "midday");
  });

  it("reads the last stretch before close as evening", () => {
    assert.equal(dayPhase(TICKS_PER_DAY - 1), "evening");
  });

  it("closes the shop at the day's last minute", () => {
    assert.equal(dayPhase(TICKS_PER_DAY), "night");
  });

  it("stays night through overtime", () => {
    assert.equal(dayPhase(TICKS_PER_DAY + 200), "night");
  });
});

describe("the calendar day", () => {
  it("is the working day plus the overnight", () => {
    assert.equal(TICKS_PER_CALENDAR_DAY, TICKS_PER_DAY + NIGHT_TICKS);
  });

  it("spans a full 24 hours of minutes", () => {
    assert.equal(TICKS_PER_CALENDAR_DAY, 24 * 60);
  });
});
