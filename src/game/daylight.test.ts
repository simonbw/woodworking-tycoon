import assert from "node:assert";
import { describe, it } from "node:test";
import {
  interiorUnderLamps,
  daylightAt,
  NIGHT_ALTITUDE,
  sunAltitude,
  SUNRISE_ALTITUDE,
  SUNSET_ALTITUDE,
} from "./daylight";

describe("the sun's position", () => {
  it("rises on the left and sets on the right", () => {
    assert.equal(sunAltitude(0, false), SUNRISE_ALTITUDE);
    assert.equal(sunAltitude(1, false), SUNSET_ALTITUDE);
    // Altitude is measured from the left horizon around, so it falls.
    assert.ok(sunAltitude(0.25, false) > sunAltitude(0.75, false));
  });

  it("is highest in the middle of the day", () => {
    const noon = sunAltitude(0.5, false);
    assert.ok(noon > 89 && noon < 91, `noon sun at ${noon}°`);
  });

  it("drops below the horizon at night, whatever the clock says", () => {
    assert.equal(sunAltitude(1, true), NIGHT_ALTITUDE);
    // Overtime runs the day past its budget; the sun doesn't keep going.
    assert.equal(sunAltitude(1.8, true), NIGHT_ALTITUDE);
    assert.equal(sunAltitude(1.8, false), SUNSET_ALTITUDE);
  });
});

describe("the shadow the building throws", () => {
  it("falls away from the sun, so it swings across the day", () => {
    // Morning sun on the left throws the shadow right, and vice versa.
    assert.ok(daylightAt(0, false).shadow.dx > 0);
    assert.ok(daylightAt(1, false).shadow.dx < 0);
    // Straight down the screen when the sun is overhead.
    assert.ok(Math.abs(daylightAt(0.5, false).shadow.dx) < 0.01);
  });

  it("is short and hard at noon, long and soft at the ends", () => {
    const noon = daylightAt(0.5, false).shadow;
    const morning = daylightAt(0, false).shadow;
    const reach = (s: { dx: number; dy: number }) => Math.hypot(s.dx, s.dy);
    assert.ok(reach(morning) > reach(noon) * 2);
    assert.ok(noon.alpha > morning.alpha);
  });

  it("goes away entirely at night", () => {
    assert.equal(daylightAt(1, true).shadow.alpha, 0);
  });
});

describe("the light it makes", () => {
  it("leaves midday alone", () => {
    // White multiplies to a no-op, so the art shows its own colors.
    assert.equal(daylightAt(0.32, false).outdoorTint, 0xffffff);
  });

  it("opens bright — 7 AM in June is hours after sunrise", () => {
    // The mistake worth guarding against is treating the start of the
    // working day as dawn: the lawn goes near-black under a tint meant
    // for twilight, because LAWN_TINT has already spent most of the
    // headroom. Every channel at the open stays high.
    const open = daylightAt(0, false).outdoorTint;
    for (const shift of [0, 8, 16]) {
      assert.ok(
        ((open >> shift) & 0xff) >= 0xc0,
        `opening light too dark: ${open.toString(16)}`,
      );
    }
  });

  it("comes up cool, warms through the afternoon, goes blue at night", () => {
    const channel = (color: number, shift: number) => (color >> shift) & 0xff;
    const dawn = daylightAt(0, false).outdoorTint;
    const evening = daylightAt(1, false).outdoorTint;
    const night = daylightAt(1, true).outdoorTint;
    // Dawn and night are bluer than they are red; evening is the reverse.
    assert.ok(channel(dawn, 0) > channel(dawn, 16));
    assert.ok(channel(night, 0) > channel(night, 16));
    assert.ok(channel(evening, 16) > channel(evening, 0));
  });

  it("keeps the shop workable at every hour — the lights are on", () => {
    // Deliberately measured *under the lamps*, not on the bare ambient:
    // the ambient is supposed to go dark at night, and the promise the
    // shop makes is that where you work you can see. Asserting on the
    // ambient would forbid the very dimness the fixtures exist to answer.
    for (const [progress, night] of [
      [0, false],
      [0.5, false],
      [1, false],
      [1, true],
    ] as const) {
      const lit = interiorUnderLamps(daylightAt(progress, night));
      for (const shift of [0, 8, 16]) {
        assert.ok(
          ((lit >> shift) & 0xff) >= 0xb0,
          `shop too dark to work in at ${progress}/${night}: ${lit.toString(16)}`,
        );
      }
    }
  });

  it("goes genuinely dark indoors once the lamps are taken away", () => {
    // The counterpart to the test above, and the thing that makes it
    // mean something: an unlit garage at midnight is dark. If this ever
    // passes trivially, the interior has been exempted from the night
    // again and the lamps are decoration.
    const ambient = daylightAt(1, true).interiorTint;
    assert.ok(
      ((ambient >> 16) & 0xff) < 0x90,
      `unlit interior should be dark, got ${ambient.toString(16)}`,
    );
  });

  it("only leans on the shop's own lamps once the sky is going", () => {
    // The same number shapes the pool inside and the spill outside, so
    // the two can never disagree about whether the lights are on.
    assert.equal(daylightAt(0.5, false).lamps, 0);
    assert.ok(daylightAt(0.9, false).lamps > 0);
    assert.equal(daylightAt(1, true).lamps, 1);
  });
});
