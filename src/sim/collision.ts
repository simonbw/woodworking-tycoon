import { Game } from "../core/Game";
import { Entity } from "../core/entity/Entity";
import { lotSize, truckSolid, wallSolids } from "../game/lot";
import { standSolid } from "../game/stand";
import { CollisionWorld, Solid } from "../game/player-motion";
import { ShopInfo } from "./singletons/ShopInfo";

/**
 * How the walkable world is assembled in the entity world.
 *
 * The geometry itself is the old world's (`src/game/lot.ts`,
 * `src/game/player-motion.ts` — pure, shared). What changes is where the
 * solids come from: instead of one function reading a GameState, every
 * entity that occupies floor (machines, crates) tags itself "solids" and
 * answers `getSolids()`; the builder sweeps them up along with the lot's
 * fixed geometry (walls, the stand, and the parked truck while the
 * player is home to park it).
 */

export const SOLIDS_TAG = "solids";

export interface SolidProvider extends Entity {
  getSolids(): ReadonlyArray<Solid>;
}

function isSolidProvider(entity: Entity): entity is SolidProvider {
  return typeof (entity as Partial<SolidProvider>).getSolids === "function";
}

export function buildCollisionWorld(
  game: Game,
  { truckParked = true }: { truckParked?: boolean } = {},
): CollisionWorld {
  const shopInfo = game.entities.getSingleton(ShopInfo).info;
  const solids: Solid[] = [
    ...wallSolids(shopInfo),
    standSolid(shopInfo),
    ...(truckParked ? [truckSolid(shopInfo)] : []),
  ];
  for (const entity of game.entities.getTagged(SOLIDS_TAG)) {
    if (isSolidProvider(entity)) {
      solids.push(...entity.getSolids());
    }
  }
  return { size: lotSize(shopInfo), solids };
}
