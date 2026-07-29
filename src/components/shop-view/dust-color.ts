import { dustKey } from "../../game/Dust";
import { GameState } from "../../game/GameState";
import { Species } from "../../game/Materials";
import { rotateVec, translateVec, vectorEquals } from "../../game/Vectors";
import { colorBySpecies } from "./colorBySpecies";

/**
 * What color a cleaning tool would kick up right now: the dominant
 * species on the floor underfoot or on the faced cell — or in the pile
 * being pushed there. Null when there's nothing to kick; a dry stroke
 * throws no chips.
 */
export function dominantDustColor(gs: GameState): string | null {
  const facing = translateVec(
    gs.player.position,
    rotateVec([1, 0], gs.player.direction),
  );
  const facingPile = gs.materialPiles.find(
    (pile) =>
      pile.material.type === "sawdustPile" &&
      vectorEquals(pile.position, facing),
  );
  const sources = [
    gs.dust[dustKey(gs.player.position)],
    gs.dust[dustKey(facing)],
    facingPile?.material.type === "sawdustPile"
      ? facingPile.material.contents
      : undefined,
  ];
  for (const amounts of sources) {
    if (!amounts) continue;
    let best: Species | null = null;
    let bestAmount = 0;
    for (const [species, amount] of Object.entries(amounts)) {
      if ((amount ?? 0) > bestAmount) {
        best = species as Species;
        bestAmount = amount ?? 0;
      }
    }
    if (best) {
      return colorBySpecies[best].primary;
    }
  }
  return null;
}
