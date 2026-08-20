import assert from "node:assert";
import { describe, it } from "node:test";
import { BENCH_DUST_INTERVAL_SECONDS, BenchDustThrottle } from "./benchDust";

describe("bench dust throttle", () => {
  it("sheds on the first stroke of a pass", () => {
    const throttle = new BenchDustThrottle();
    assert.ok(throttle.due());
  });

  it("holds off until the interval has passed", () => {
    const throttle = new BenchDustThrottle();
    assert.ok(throttle.due());
    throttle.step(BENCH_DUST_INTERVAL_SECONDS / 2);
    assert.ok(!throttle.due());
    throttle.step(BENCH_DUST_INTERVAL_SECONDS / 2);
    assert.ok(throttle.due());
  });

  it("counts time whether or not the tool is cutting", () => {
    const throttle = new BenchDustThrottle();
    assert.ok(throttle.due());
    // A pause between strokes still runs the clock, so the stroke that
    // comes after it sheds right away.
    for (let i = 0; i < 60; i++) {
      throttle.step(1 / 60);
    }
    assert.ok(throttle.due());
  });

  it("sheds about twice a second of held-down stroking", () => {
    const throttle = new BenchDustThrottle();
    let emissions = 0;
    // Ten seconds of continuous work at 60 frames a second.
    for (let frame = 0; frame < 600; frame++) {
      throttle.step(1 / 60);
      if (throttle.due()) emissions++;
    }
    const expected = 10 / BENCH_DUST_INTERVAL_SECONDS;
    assert.ok(
      Math.abs(emissions - expected) <= 1,
      `${emissions} emissions in ten seconds, expected about ${expected}`,
    );
  });
});
