/**
 * Seeded pseudo-random number generators for deterministic simulation.
 *
 * A `Game` built with `{ random: mulberry32(seed) }` replays identically:
 * sim code draws all its randomness from `game.random`, so the same seed
 * and the same inputs produce the same world, tick for tick.
 */

/** A fast 32-bit seeded PRNG. Returns a function yielding floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
