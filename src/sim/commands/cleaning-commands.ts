import { Game } from "../../core/Game";
import { BROOM_COST, holdingBroom } from "../../game/HeldTool";
import { isOutdoors } from "../../game/lot";
import { personCanWork } from "../../game/Person";
import { carryingShopVac, SHOP_VAC_COST } from "../../game/ShopVac";
import { chebyshevDistance } from "../../game/Vectors";
import { ShopVacEntity } from "../entities/ShopVacEntity";

// Pure read helpers re-exported so the shell reads them through the
// command surface rather than reaching into the rule modules.
export {
  canSweepAt,
  dustpanFillFraction,
  nextToGarbageCan,
} from "../../game/game-actions/dust-actions";
export { canVacuumAt } from "../../game/game-actions/shop-vac-actions";
import { projectGameState } from "../projection";
import { Broom } from "../singletons/Broom";
import { Wallet } from "../singletons/Wallet";
import { emitSound } from "./sound";

/**
 * The cleaning command surface: every mutation input can make against
 * the broom and the shop vac. Each command validates through the shared
 * rules in `game/game-actions/dust-actions.ts` and `shop-vac-actions.ts`
 * over a projection snapshot, then writes onto the entities; a refusal
 * logs and returns false. Emptying the dustpan and the vac canister are
 * deliberately not commands — they're the same held-operate verb as
 * sweeping and suction, run by the CleaningSystem's tick passes at the
 * garbage can.
 */

/** Bought at the store; it arrives leaning at the material dropoff spot. */
export function buyBroom(game: Game): boolean {
  const gameState = projectGameState(game);
  if (gameState.broomOwned) {
    console.warn("Already own a broom");
    return false;
  }
  if (gameState.money < BROOM_COST) {
    console.warn("Tried to buy the broom without enough money");
    return false;
  }
  game.entities.getSingleton(Wallet).money -= BROOM_COST;
  const broom = game.entities.getSingleton(Broom);
  broom.owned = true;
  broom.position = [...gameState.shopInfo.materialDropoffPosition];
  return true;
}

/**
 * Take the broom off the floor and into the hands. Committing: with the
 * broom in hand the player can't pick up stock, run a machine, or grab
 * the vac — Space belongs to sweeping until the broom is set down.
 */
export function pickUpBroom(game: Game): boolean {
  const gameState = projectGameState(game);
  if (!gameState.broomOwned) {
    return false;
  }
  if (
    gameState.broomPosition === null ||
    chebyshevDistance(gameState.broomPosition, gameState.player.position) > 1
  ) {
    return false;
  }
  if (
    !personCanWork(gameState.player) ||
    gameState.player.carriedMachine != null ||
    gameState.player.inventory.length > 0 ||
    carryingShopVac(gameState)
  ) {
    return false;
  }
  game.entities.getSingleton(Broom).position = null;
  emitSound(game, "material-pickup");
  return true;
}

/** Lean the broom on the floor right here — pan contents and all. */
export function putDownBroom(game: Game): boolean {
  const gameState = projectGameState(game);
  if (!holdingBroom(gameState) || gameState.player.away !== null) {
    return false;
  }
  // The broom stays in hand on the lot — it leans on shop floor, not lawn
  if (isOutdoors(gameState.shopInfo, gameState.player.position)) {
    return false;
  }
  game.entities.getSingleton(Broom).position = [...gameState.player.position];
  emitSound(game, "material-drop");
  return true;
}

/** Bought at the store; it's delivered to the material dropoff spot. */
export function buyShopVac(game: Game): boolean {
  const gameState = projectGameState(game);
  if (gameState.shopVac !== null) {
    console.warn("Already own a shop vac");
    return false;
  }
  if (gameState.money < SHOP_VAC_COST) {
    console.warn("Tried to buy the shop vac without enough money");
    return false;
  }
  game.entities.getSingleton(Wallet).money -= SHOP_VAC_COST;
  game.addEntity(
    new ShopVacEntity({
      position: [...gameState.shopInfo.materialDropoffPosition],
      canister: {},
    }),
  );
  return true;
}

/**
 * Grab the vac (standing on it) or park it right here (dragging it).
 * Anything else is a no-op — you can't grab what you're not next to.
 */
export function toggleCarryShopVac(game: Game): boolean {
  const gameState = projectGameState(game);
  const vac = game.entities.tryGetSingleton(ShopVacEntity);
  if (!vac) {
    return false;
  }
  if (vac.position === null) {
    // Keep dragging it on the lot — the vac parks on shop floor only
    if (isOutdoors(gameState.shopInfo, gameState.player.position)) {
      return false;
    }
    vac.position = [...gameState.player.position];
    return true;
  }
  // The hose takes a hand — put the broom down before grabbing the vac
  if (holdingBroom(gameState)) {
    return false;
  }
  if (chebyshevDistance(vac.position, gameState.player.position) <= 1) {
    vac.position = null;
    return true;
  }
  return false;
}
