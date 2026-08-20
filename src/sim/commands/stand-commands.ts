import { Game } from "../../core/Game";
import { MaterialInstance } from "../../game/Materials";
import { handSpaceLeft } from "../../game/Person";
import { atStand, isSellable } from "../../game/stand";
import { Player } from "../entities/Player";
import { StandEntity } from "../entities/StandEntity";
import { projectGameState } from "../projection";

/**
 * The stand command surface: setting pieces out and taking them back.
 * Each command validates through the shared helpers in `game/stand.ts`
 * (against a projection snapshot), then writes onto the entities; a
 * refusal logs and returns false. Selling is not a command — customers
 * do that, in the StreetSystem.
 */

function player(game: Game): Player {
  return game.entities.getSingleton(Player);
}

/**
 * Sets pieces from the arms out on the stand, the way the truck's bed
 * loads: one per press, an armful with Shift. Only sellable pieces go
 * out — raw stock stays in hand. The chip never offers an unsellable
 * piece, but the command enforces both rules anyway because where and
 * what the stand sells is a game rule.
 */
export function setOutAtStand(
  game: Game,
  materials: ReadonlyArray<MaterialInstance>,
): boolean {
  const gameState = projectGameState(game);
  if (!atStand(gameState.shopInfo, gameState.player.position)) {
    console.warn("Tried to set out pieces away from the stand");
    return false;
  }
  if (materials.length === 0) {
    console.warn("Tried to set out nothing");
    return false;
  }
  if (
    !materials.every((material) =>
      gameState.player.inventory.some((item) => item === material),
    )
  ) {
    console.warn("Tried to set out material not in inventory");
    return false;
  }
  if (!materials.every(isSellable)) {
    console.warn("Tried to set out something nobody would pay for");
    return false;
  }
  const stand = game.entities.getSingleton(StandEntity);
  const thePlayer = player(game);
  stand.pieces = [...stand.pieces, ...materials];
  thePlayer.inventory = thePlayer.inventory.filter(
    (item) => !materials.includes(item),
  );
  game.dispatch("standChanged", {});
  game.dispatch("playerChanged", {});
  return true;
}

/**
 * Takes pieces back off the stand into the arms — the newest set out
 * first, as many as asked for, capped by what the hands can still hold.
 */
export function takeFromStand(game: Game, count = 1): boolean {
  const gameState = projectGameState(game);
  if (!atStand(gameState.shopInfo, gameState.player.position)) {
    console.warn("Tried to take from the stand out of reach");
    return false;
  }
  const stand = game.entities.getSingleton(StandEntity);
  const taken = Math.min(
    count,
    stand.pieces.length,
    handSpaceLeft(gameState.player),
  );
  if (taken <= 0) {
    console.warn("Tried to take from the stand with full hands");
    return false;
  }
  const kept = stand.pieces.slice(0, stand.pieces.length - taken);
  const returned = stand.pieces.slice(stand.pieces.length - taken);
  const thePlayer = player(game);
  stand.pieces = kept;
  thePlayer.inventory = [...thePlayer.inventory, ...returned];
  game.dispatch("standChanged", {});
  game.dispatch("playerChanged", {});
  return true;
}
