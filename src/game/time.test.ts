import assert from "node:assert";
import { describe, it } from "node:test";
import { SCAVENGE_DURATION_TICKS } from "./game-actions/scavenge-actions";
import { GLUE_CURE_TICKS } from "./machines/benchOperations";
import { dayNumber, formatClock, formatDuration, TICKS_PER_DAY } from "./time";

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

describe("formatClock", () => {
  it("opens the day at seven", () => {
    assert.equal(formatClock(0), "7:00 AM");
  });

  it("crosses noon without repeating twelve", () => {
    assert.equal(formatClock(300), "12:00 PM");
  });

  it("reads afternoon hours in twelve-hour form", () => {
    assert.equal(formatClock(360), "1:00 PM");
  });

  it("ends the day just before five", () => {
    assert.equal(formatClock(TICKS_PER_DAY - 1), "4:59 PM");
  });

  it("opens the next day back at seven", () => {
    assert.equal(formatClock(TICKS_PER_DAY), "7:00 AM");
  });
});

describe("dayNumber", () => {
  it("counts the first day as one", () => {
    assert.equal(dayNumber(0), 1);
  });

  it("holds the day until the last tick of it", () => {
    assert.equal(dayNumber(TICKS_PER_DAY - 1), 1);
  });

  it("turns over on the day boundary", () => {
    assert.equal(dayNumber(TICKS_PER_DAY), 2);
  });
});
