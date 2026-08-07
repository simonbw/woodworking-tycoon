import assert from "node:assert";
import { describe, it } from "node:test";
import { dateForDay, formatShopDate } from "./calendar";

describe("the shop calendar", () => {
  it("opens on Monday, 9 June 2025", () => {
    const first = dateForDay(1);
    assert.equal(first.toISOString().slice(0, 10), "2025-06-09");
    // Monday, so the save's first day is also a week's first day.
    assert.equal(first.getUTCDay(), 1);
  });

  it("advances one calendar day per shop day", () => {
    assert.equal(formatShopDate(1), "JUN 9");
    assert.equal(formatShopDate(2), "JUN 10");
  });

  it("rolls over the end of a month", () => {
    // 9 June + 21 days = 30 June; one more is July.
    assert.equal(formatShopDate(22), "JUN 30");
    assert.equal(formatShopDate(23), "JUL 1");
  });

  it("rolls over the end of a year", () => {
    // 9 June 2025 → 31 December 2025 is 205 days, so day 206.
    assert.equal(formatShopDate(206), "DEC 31");
    assert.equal(formatShopDate(207), "JAN 1");
  });

  it("counts a leap day in a shop that runs long enough to see one", () => {
    // 2028 is a leap year; the shop should reach 29 February, not skip it.
    const leapDay = Math.round(
      (Date.UTC(2028, 1, 29) - Date.UTC(2025, 5, 9)) / 86400000 + 1,
    );
    assert.equal(formatShopDate(leapDay), "FEB 29");
    assert.equal(formatShopDate(leapDay + 1), "MAR 1");
  });
});
