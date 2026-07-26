import assert from "node:assert";
import { describe, it } from "node:test";
import {
  advanceFootstepCadence,
  distanceBetween,
  FootstepCadence,
  initialFootstepCadence,
  STRIDE_LENGTH,
} from "./footsteps";

/** Walk a cadence forward through several samples of the same size. */
function walk(
  cadence: FootstepCadence,
  distance: number,
  samples: number,
): { cadence: FootstepCadence; steps: number } {
  let steps = 0;
  for (let i = 0; i < samples; i++) {
    const sample = advanceFootstepCadence(cadence, distance, true);
    cadence = sample.cadence;
    if (sample.stepped) steps++;
  }
  return { cadence, steps };
}

describe("advanceFootstepCadence", () => {
  it("lands a step the moment the body sets off", () => {
    const sample = advanceFootstepCadence(initialFootstepCadence, 0.1, true);
    assert.equal(sample.stepped, true);
  });

  it("stays silent while the body stands still", () => {
    const sample = advanceFootstepCadence(initialFootstepCadence, 0, false);
    assert.equal(sample.stepped, false);
  });

  it("does not step again until a full stride has passed", () => {
    const { cadence } = walk(initialFootstepCadence, 0, 1);
    const { steps } = walk(cadence, STRIDE_LENGTH / 10, 9);
    assert.equal(steps, 0);
  });

  it("steps once per stride of floor covered", () => {
    const { cadence } = walk(initialFootstepCadence, 0, 1);
    const { steps } = walk(cadence, 0.35, 137);
    assert.equal(steps, Math.floor((0.35 * 137) / STRIDE_LENGTH));
  });

  it("counts by distance, not by how often it is sampled", () => {
    const { cadence } = walk(initialFootstepCadence, 0, 1);
    // The same stretch of floor, walked in twice as many samples.
    const coarse = walk(cadence, 0.2, 100).steps;
    const fine = walk(cadence, 0.1, 200).steps;
    assert.equal(coarse, fine);
  });

  it("keeps the leftover distance rather than dropping it", () => {
    const { cadence } = advanceFootstepCadence(
      { sinceLastStep: STRIDE_LENGTH - 0.1, wasMoving: true },
      0.3,
      true,
    );
    assert.ok(Math.abs(cadence.sinceLastStep - 0.2) < 1e-9);
  });

  it("forgets banked distance when the body stops", () => {
    const stopped = advanceFootstepCadence(
      { sinceLastStep: STRIDE_LENGTH - 0.01, wasMoving: true },
      0,
      false,
    );
    assert.equal(stopped.cadence.sinceLastStep, 0);
    // Setting off again steps immediately, then owes a whole stride.
    const restart = advanceFootstepCadence(stopped.cadence, 0.01, true);
    assert.equal(restart.stepped, true);
    assert.equal(restart.cadence.sinceLastStep, 0);
  });

  it("does not pay out a burst of steps for a teleport", () => {
    const sample = advanceFootstepCadence(
      { sinceLastStep: 0, wasMoving: true },
      STRIDE_LENGTH * 10,
      true,
    );
    // The jump was clamped, so it banks less than a stride and stays quiet
    // rather than owing ten footfalls across the shop.
    assert.equal(sample.stepped, false);
    assert.ok(sample.cadence.sinceLastStep < STRIDE_LENGTH);
  });

  it("does not run backwards on a negative distance", () => {
    const sample = advanceFootstepCadence(
      { sinceLastStep: 1, wasMoving: true },
      -5,
      true,
    );
    assert.equal(sample.cadence.sinceLastStep, 1);
  });

  it("steps less often when the walk is slower", () => {
    const { cadence } = walk(initialFootstepCadence, 0, 1);
    // Same number of frames; the slower body covers half the floor.
    const fast = walk(cadence, 0.2, 100).steps;
    const slow = walk(cadence, 0.1, 100).steps;
    assert.ok(slow < fast, `${slow} should be fewer than ${fast}`);
  });
});

describe("distanceBetween", () => {
  it("measures the straight line between two body positions", () => {
    assert.equal(distanceBetween([1, 1], [4, 5]), 5);
  });
});
