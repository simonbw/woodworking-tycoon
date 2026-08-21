import { Game } from "../../core/Game";
import { BROOM_COST, CleaningGear, holdingBroom } from "../../game/HeldTool";
import { isOutdoors } from "../../game/lot";
import { personCanWork } from "../../game/Person";
import { carryingShopVac, SHOP_VAC_COST } from "../../game/ShopVac";
import { chebyshevDistance } from "../../game/Vectors";
import { Player } from "../entities/Player";
import { ShopVacEntity } from "../entities/ShopVacEntity";

// Pure read helpers re-exported so the shell reads them through the
// command surface rather than reaching into the rule modules.
export {
  canSweepAt,
  dustpanFillFraction,
  nextToGarbageCan,
} from "../../game/game-actions/dust-actions";
export { canVacuumAt } from "../../game/game-actions/shop-vac-actions";
import { projectPerson } from "../projection";
import { Broom } from "../singletons/Broom";
import { ShopInfo } from "../singletons/ShopInfo";
import { Wallet } from "../singletons/Wallet";
import { emitSound } from "./sound";

/**
 * The cleaning command surface: every mutation input can make against
 * the broom and the shop vac. Each command validates through the shared
 * rules in `game/game-actions/dust-actions.ts` and `shop-vac-actions.ts`
 * against the live entities, then writes onto them; a refusal logs and
 * returns false. Emptying the dustpan and the vac canister are
 * deliberately not commands — they're the same held-operate verb as
 * sweeping and suction, run by the CleaningSystem's tick passes at the
 * garbage can.
 */

/**
 * The broom's and vac's carry state, as the slice the pure held-tool
 * questions read — the sim side of `CleaningGear`.
 */
export function cleaningGear(game: Game): CleaningGear {
  const broom = game.entities.tryGetSingleton(Broom);
  const vac = game.entities.tryGetSingleton(ShopVacEntity);
  return {
    broomOwned: broom?.owned ?? false,
    broomPosition: broom?.position ?? null,
    shopVac: vac ? { position: vac.position } : null,
  };
}

/** Bought at the store; it arrives leaning at the material dropoff spot. */
export function buyBroom(game: Game): boolean {
  const broom = game.entities.getSingleton(Broom);
  if (broom.owned) {
    console.warn("Already own a broom");
    return false;
  }
  const wallet = game.entities.getSingleton(Wallet);
  if (wallet.money < BROOM_COST) {
    console.warn("Tried to buy the broom without enough money");
    return false;
  }
  wallet.money -= BROOM_COST;
  broom.owned = true;
  broom.position = [
    ...game.entities.getSingleton(ShopInfo).info.materialDropoffPosition,
  ];
  game.dispatch("progressionChanged", {});
  game.dispatch("cleaningChanged", {});
  return true;
}

/**
 * Take the broom off the floor and into the hands. Committing: with the
 * broom in hand the player can't pick up stock, run a machine, or grab
 * the vac — Space belongs to sweeping until the broom is set down.
 */
export function pickUpBroom(game: Game): boolean {
  const broom = game.entities.getSingleton(Broom);
  if (!broom.owned) {
    return false;
  }
  const player = game.entities.getSingleton(Player);
  if (
    broom.position === null ||
    chebyshevDistance(broom.position, player.cell) > 1
  ) {
    return false;
  }
  if (
    !personCanWork(projectPerson(game)) ||
    player.carriedMachine != null ||
    player.inventory.length > 0 ||
    carryingShopVac(cleaningGear(game))
  ) {
    return false;
  }
  broom.position = null;
  game.dispatch("cleaningChanged", {});
  emitSound(game, "material-pickup");
  return true;
}

/** Lean the broom on the floor right here — pan contents and all. */
export function putDownBroom(game: Game): boolean {
  const player = game.entities.getSingleton(Player);
  if (!holdingBroom(cleaningGear(game)) || player.away !== null) {
    return false;
  }
  // The broom stays in hand on the lot — it leans on shop floor, not lawn
  const shopInfo = game.entities.getSingleton(ShopInfo).info;
  if (isOutdoors(shopInfo, player.cell)) {
    return false;
  }
  game.entities.getSingleton(Broom).position = [...player.cell];
  game.dispatch("cleaningChanged", {});
  emitSound(game, "material-drop");
  return true;
}

/** Bought at the store; it's delivered to the material dropoff spot. */
export function buyShopVac(game: Game): boolean {
  if (game.entities.tryGetSingleton(ShopVacEntity)) {
    console.warn("Already own a shop vac");
    return false;
  }
  const wallet = game.entities.getSingleton(Wallet);
  if (wallet.money < SHOP_VAC_COST) {
    console.warn("Tried to buy the shop vac without enough money");
    return false;
  }
  wallet.money -= SHOP_VAC_COST;
  game.addEntity(
    new ShopVacEntity({
      position: [
        ...game.entities.getSingleton(ShopInfo).info.materialDropoffPosition,
      ],
      canister: {},
    }),
  );
  game.dispatch("progressionChanged", {});
  game.dispatch("cleaningChanged", {});
  return true;
}

/**
 * Grab the vac (standing on it) or park it right here (dragging it).
 * Anything else is a no-op — you can't grab what you're not next to.
 */
export function toggleCarryShopVac(game: Game): boolean {
  const vac = game.entities.tryGetSingleton(ShopVacEntity);
  if (!vac) {
    return false;
  }
  const player = game.entities.getSingleton(Player);
  const shopInfo = game.entities.getSingleton(ShopInfo).info;
  if (vac.position === null) {
    // Keep dragging it on the lot — the vac parks on shop floor only
    if (isOutdoors(shopInfo, player.cell)) {
      return false;
    }
    vac.position = [...player.cell];
    game.dispatch("cleaningChanged", {});
    return true;
  }
  // The hose takes a hand — put the broom down before grabbing the vac
  if (holdingBroom(cleaningGear(game))) {
    return false;
  }
  if (chebyshevDistance(vac.position, player.cell) <= 1) {
    vac.position = null;
    game.dispatch("cleaningChanged", {});
    return true;
  }
  return false;
}
