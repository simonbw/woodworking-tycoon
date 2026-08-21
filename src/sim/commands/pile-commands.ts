import { Game } from "../../core/Game";
import { heldTool } from "../../game/HeldTool";
import { isOutdoors } from "../../game/lot";
import { MaterialInstance } from "../../game/Materials";
import { handSpaceLeft } from "../../game/Person";
import { pileWithinReach } from "../../game/pile-helpers";
import { cellCenter } from "../../game/player-motion";
import { Vector } from "../../game/Vectors";
import { MaterialPileEntity } from "../entities/MaterialPileEntity";
import { Player } from "../entities/Player";
import { projectPerson } from "../projection";
import { ShopInfo } from "../singletons/ShopInfo";
import { cleaningGear } from "./cleaning-commands";
import { emitSound } from "./sound";

/**
 * Moving loose stock between the floor and the hands. Each command
 * validates through the shared material helpers, against a projection
 * snapshot, then writes onto the entities. A refusal logs and returns
 * false.
 */

function player(game: Game): Player {
  return game.entities.getSingleton(Player);
}

/** Pick piles up off the floor into the arms. */
export function pickUpMaterial(
  game: Game,
  piles: ReadonlyArray<MaterialPileEntity>,
): boolean {
  const person = projectPerson(game);
  // A tool in hand commits the hands — lean the broom (or park the
  // vac) before picking stock up. Enforced here, not just in the
  // keyboard layer, so sequence tests obey the same physics.
  if (heldTool(cleaningGear(game)) !== null) {
    console.warn("Tried to pick up material while holding a tool");
    return false;
  }
  // The arms hold HAND_CAPACITY pieces; a load that doesn't fit is
  // refused whole, the same way a machine's bay refuses an overfill.
  if (piles.length > handSpaceLeft(person)) {
    console.warn("Tried to pick up more than the hands can carry");
    return false;
  }
  for (const pile of piles) {
    // Reach is geometric: the piece's resting footprint must come within
    // arm's reach of the player's cell (see pileWithinReach), so long
    // stock is grabbable anywhere along its length.
    if (!pileWithinReach(pile.pile, person.position)) {
      console.warn("Tried to pick up material from wrong position");
      return false;
    }
  }
  const thePlayer = player(game);
  thePlayer.inventory = [
    ...thePlayer.inventory,
    ...piles.map((pile) => pile.material),
  ];
  for (const pile of piles) {
    pile.destroy();
  }
  game.dispatch("pilesChanged", {});
  game.dispatch("playerChanged", {});
  emitSound(game, "material-pickup");
  return true;
}

/**
 * Set materials down where the player stands. Piles sit at continuous
 * positions: `at` is the landing point in cell units — the keyboard layer
 * passes the body's actual position, so a piece lands exactly where the
 * woodworker is, not snapped to the cell underfoot. `rotation` is the
 * orientation the piece lies down in (radians, world frame). Callers
 * without a landing point omit both and the piece lands square at the
 * cell's center.
 */
export function dropMaterial(
  game: Game,
  materials: ReadonlyArray<MaterialInstance>,
  at?: Vector,
  rotation: number = 0,
): boolean {
  const thePlayer = player(game);
  const shopInfo = game.entities.getSingleton(ShopInfo).info;
  const position = at ?? cellCenter(thePlayer.cell);
  // Piles live on the shop floor; the lot is walkable ground and nothing
  // else. What's carried stays in hand until the player is back inside
  // (or at the truck's bed, where F loads instead).
  if (
    isOutdoors(shopInfo, thePlayer.cell) ||
    position[1] >= shopInfo.size[1]
  ) {
    console.warn("Tried to drop material outside the shop");
    return false;
  }
  for (const material of materials) {
    if (!thePlayer.inventory.some((item) => item === material)) {
      console.warn("Tried to drop material not in inventory");
      return false;
    }
  }
  thePlayer.inventory = thePlayer.inventory.filter(
    (item) => !materials.includes(item),
  );
  for (const material of materials) {
    game.addEntity(new MaterialPileEntity(material, position, rotation));
  }
  game.dispatch("pilesChanged", {});
  game.dispatch("playerChanged", {});
  emitSound(game, "material-drop");
  return true;
}
