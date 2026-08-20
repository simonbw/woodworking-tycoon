import { LAYERS } from "../config/layers";

/**
 * Draw order within the shared render layers — the old ShopView's JSX
 * order, kept by zIndex instead of mount order, because view entities
 * spawn in whatever order the save file (or a mid-game purchase) adds
 * their sim entities.
 *
 * Only the layers whose views actually interleave get sortable children;
 * everything else keeps plain add order.
 */

/** "floorItems": power cords under the leaning broom, crates, then piles. */
export const FLOOR_ITEMS_Z = {
  powerCords: 0,
  leaningBroom: 1,
  crates: 2,
  piles: 3,
} as const;

/** "actors": the shop vac (drum, hose) draws under the player's body. */
export const ACTORS_Z = {
  shopVac: 0,
  player: 1,
} as const;

/** Turn on zIndex sorting for the interleaved layers. Call once at boot. */
export function enableViewZOrdering(): void {
  LAYERS.floorItems.container.sortableChildren = true;
  LAYERS.actors.container.sortableChildren = true;
}
