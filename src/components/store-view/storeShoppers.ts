import { CollisionWorld, stepPlayerMotion } from "../../game/player-motion";
import {
  StoreLayout,
  fixtureStandCell,
  registerStandCell,
} from "../../game/store-layout";
import { Vector } from "../../game/Vectors";

/**
 * The other people in the store: purely presentational walkers, like the
 * sidewalk's customers back home (CustomerLayer) but on the sales floor.
 * They browse a patrol of shelves, pause at each, and yield to the
 * player — and they're solid to the walking body, because shouldering
 * through a person reads wrong where sliding along a rack reads fine.
 *
 * Nothing here touches GameState: positions live in the scene and die
 * with it. Movement is the same collision step the player walks with —
 * a shopper aimed across an island slides around its corner the way a
 * body does — and one who stays wedged too long just moves on to the
 * next stop on the list instead of milling against the racking.
 */

export const SHOPPER_RADIUS = 0.55;

/** A window-shopping stroll, in cells per second. */
const SHOPPER_SPEED = 2.4;

/** How close the player has to be for a shopper to stop and yield. */
const YIELD_DISTANCE = 2.1;

/** How long a shopper browses a shelf before moving on, in seconds. */
const BROWSE_SECONDS = 3.2;

/** Give up on a leg after this long — wedged on a corner, or yielding
 * to a player who parked in the aisle. */
const LEG_TIMEOUT_SECONDS = 12;

export interface Shopper {
  position: Vector;
  /** The patrol's stops, walked in order, wrapping. */
  stops: ReadonlyArray<Vector>;
  stopIndex: number;
  /** Seconds of browsing left at the current stop; walking when 0. */
  browseLeft: number;
  /** Seconds spent on the current leg, for the wedge bail-out. */
  legSeconds: number;
  /** Stable cosmetic tint index. */
  hue: number;
}

/** Deterministic tiny PRNG so a store's crowd is stable per layout. */
function seeded(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

export function spawnShoppers(layout: StoreLayout): Shopper[] {
  const spots = [
    ...layout.fixtures.map((fixture) => fixtureStandCell(fixture)),
    registerStandCell(layout),
  ].map(([x, y]): Vector => [x + 0.5, y + 0.5]);
  if (spots.length < 2) {
    return [];
  }
  const count = Math.min(3, Math.floor(spots.length / 4));
  const rng = seeded(layout.fixtures.length * 31 + layout.interior[0]);
  return Array.from({ length: count }, (_, index) => {
    // Each shopper deals themself a patrol: a shuffled walk of the
    // store's stands, starting somewhere different from the others.
    const patrol = [...spots].sort(() => rng() - 0.5);
    return {
      position: patrol[0],
      stops: patrol,
      stopIndex: 1 % patrol.length,
      browseLeft: rng() * BROWSE_SECONDS,
      legSeconds: 0,
      hue: index,
    };
  });
}

/** One frame of everyone's stroll. Mutates in place — render-side state. */
export function stepShoppers(
  shoppers: Shopper[],
  playerPosition: Vector,
  dt: number,
  world: CollisionWorld,
): void {
  for (const shopper of shoppers) {
    if (shopper.browseLeft > 0) {
      shopper.browseLeft = Math.max(0, shopper.browseLeft - dt);
      continue;
    }
    const target = shopper.stops[shopper.stopIndex];
    const dx = target[0] - shopper.position[0];
    const dy = target[1] - shopper.position[1];
    const distance = Math.hypot(dx, dy);
    if (distance < 0.15) {
      shopper.stopIndex = (shopper.stopIndex + 1) % shopper.stops.length;
      shopper.browseLeft = BROWSE_SECONDS;
      shopper.legSeconds = 0;
      continue;
    }
    shopper.legSeconds += dt;
    if (shopper.legSeconds > LEG_TIMEOUT_SECONDS) {
      // Wedged or blocked long enough — skip the stop rather than mill
      // against whatever is in the way.
      shopper.stopIndex = (shopper.stopIndex + 1) % shopper.stops.length;
      shopper.legSeconds = 0;
      continue;
    }
    // Yield to the player: stop and wait while they're close ahead.
    const playerDistance = Math.hypot(
      playerPosition[0] - shopper.position[0],
      playerPosition[1] - shopper.position[1],
    );
    if (playerDistance < YIELD_DISTANCE) {
      continue;
    }
    shopper.position = stepPlayerMotion(
      shopper.position,
      [dx / distance, dy / distance],
      Math.min(SHOPPER_SPEED, distance / dt || SHOPPER_SPEED),
      dt,
      world,
      SHOPPER_RADIUS,
    );
  }
}
