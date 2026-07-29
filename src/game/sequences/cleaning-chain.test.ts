/**
 * The whole broom loop, from the mess to the curb: mill until the floor
 * is dusty enough to summon the broom, pick the broom up, plow the dust
 * into a pile with held-Space sweeping, lean the broom, dustpan the pile
 * into the garbage can, and haul it out.
 *
 * `dust-actions.test.ts` covers each rule (rates, the film, the pile
 * cap); the point of running them in order is that the chain has no gaps
 * — the unlock really fires from milling, the broom really commits the
 * hands, and a swept pile really leaves the world through the can.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { millingShop } from "../../../tests/fixtures/milling-shop";
import { dustTotal } from "../Dust";
import { GameState } from "../GameState";
import { heldTool, holdingBroom } from "../HeldTool";
import { MaterialInstance } from "../Materials";
import {
  pickUpBroomAction,
  putDownBroomAction,
} from "../game-actions/dust-actions";
import { toggleCarryShopVacAction } from "../game-actions/shop-vac-actions";
import {
  setOperatingAction,
  setPlayerPositionAction,
} from "../game-actions/player-actions";
import { Direction } from "../Vectors";
import { openShop, ShopDriver } from "./shop-driver";

const isRough = (m: MaterialInstance) =>
  m.type === "board" && m.surface === "rough" && m.jointedFaces === 0;
const isJointed = (m: MaterialInstance) =>
  m.type === "board" && m.jointedFaces >= 1 && m.surface === "rough";
const isSawdustPile = (m: MaterialInstance) => m.type === "sawdustPile";

function floorDust(state: GameState): number {
  return Object.values(state.dust).reduce(
    (sum, amounts) => sum + dustTotal(amounts),
    0,
  );
}

/**
 * Hold the operate key and walk the given cells, one tick per step —
 * exactly what plowing is: the cleaning pass runs off the held flag in
 * tickAction while the feet keep moving. `facing` aims the swath (the
 * broom's push, the vac's cone); omitted, the walker keeps its heading.
 */
function plow(
  shop: ShopDriver,
  route: ReadonlyArray<[number, number]>,
  facing?: Direction,
): void {
  shop.apply(setOperatingAction(true));
  for (const cell of route) {
    shop
      .apply(
        setPlayerPositionAction(cell, facing ?? shop.shop.player.direction),
      )
      .tick();
  }
  shop.apply(setOperatingAction(false));
}

describe("cleaning chain", () => {
  it("mess to curb: mill, unlock, plow, dustpan, garbage", () => {
    const shop = openShop(millingShop);
    shop.switchOn("jointer").switchOn("lunchboxPlaner");

    // Milling makes the mess: joint a face, then plane to thickness —
    // dust lands on the floor around both machines while they cut.
    const mill = () =>
      shop.feed("jointer", isRough).feed("lunchboxPlaner", isJointed);
    mill();
    while (!shop.shop.progression.sweepingUnlocked) {
      assert.ok(
        shop.inventory.some(isRough),
        "ran out of rough stock before the sawdust tutorial fired",
      );
      mill();
    }
    const mess = floorDust(shop.shop);
    assert.ok(mess >= 60, `expected a real mess, found ${mess} units`);

    // The broom leans at its home corner; picking it up takes empty hands
    shop.putEverythingDown();
    shop.standAt([1, 1]).apply(pickUpBroomAction());
    assert.strictEqual(heldTool(shop.shop), "broom");

    // Plow the rows below the jointer ([2,8]) and planer ([4,8]) — the
    // swath reaches two cells ahead, so walking the y=11..9 rows facing +x
    // covers both machines' fallout, undersides included. Two passes per
    // row: the under-machine pull is slow by design.
    const route: Array<[number, number]> = [];
    for (const y of [11, 10, 9]) {
      for (let pass = 0; pass < 2; pass++) {
        for (let x = 0; x <= 9; x++) {
          route.push([x, y]);
        }
      }
    }
    plow(shop, route);

    const after = floorDust(shop.shop);
    assert.ok(
      after < mess * 0.5,
      `plowing should clear most of the floor: ${mess} -> ${after}`,
    );
    const piles = shop.shop.materialPiles.filter((pile) =>
      isSawdustPile(pile.material),
    );
    assert.ok(piles.length > 0, "plowing should have built a sawdust pile");
    const gathered = piles.reduce(
      (sum, pile) =>
        pile.material.type === "sawdustPile"
          ? sum + dustTotal(pile.material.contents)
          : sum,
      0,
    );
    assert.ok(
      gathered > mess * 0.4,
      `the piles should hold most of the mess: ${gathered} of ${mess}`,
    );

    // Sweeping commits the hands: the pickup action refuses while the
    // broom is in hand, so the boards stay on the floor
    shop.takeFromFloor((m) => m.type === "board", 1);
    assert.strictEqual(
      shop.inventory.length,
      0,
      "picking up stock with the broom in hand should refuse",
    );

    // Dustpan phase: lean the broom, scoop the pile, toss it in the can,
    // and haul the bag out. Emptying is the can's own held operation.
    shop.apply(putDownBroomAction());
    assert.strictEqual(holdingBroom(shop.shop), false);
    shop.takeFromFloor(isSawdustPile);
    shop.standAt([2, 13]).load("garbageCan", isSawdustPile);
    // Emptying goes a piece at a time — the held key runs it again and
    // again, which here is one run() per bag
    while (shop.machine("garbageCan").state.inputMaterials.length > 0) {
      shop.run("garbageCan");
    }
    assert.strictEqual(
      shop.shop.materialPiles.filter((pile) => isSawdustPile(pile.material))
        .length,
      0,
      "the swept pile should be gone from the floor",
    );
    assert.strictEqual(
      shop.machine("garbageCan").state.inputMaterials.length,
      0,
      "the can should have been emptied",
    );
  });

  it("the vac finishes the job: suction to zero, deliberate empty", () => {
    const shop = openShop(millingShop);
    shop.switchOn("jointer").switchOn("lunchboxPlaner");
    // Make a mess, then grant the vac — buying it is unit-tested; the
    // chain under test starts at the hose.
    shop
      .feed("jointer", isRough)
      .feed("lunchboxPlaner", isJointed)
      .putEverythingDown();
    const mess = floorDust(shop.shop);
    assert.ok(mess > 0, "milling should have shed dust");
    shop.arrange((state) => ({
      ...state,
      shopVac: { position: state.player.position, canister: {} },
    }));

    // Grab the hose and hoover the fallout rows, holding the key
    shop.apply(toggleCarryShopVacAction());
    assert.strictEqual(heldTool(shop.shop), "vacHose");
    const route: Array<[number, number]> = [];
    for (const y of [11, 10, 9]) {
      for (let pass = 0; pass < 2; pass++) {
        for (let x = 0; x <= 9; x++) {
          route.push([x, y]);
        }
      }
    }
    plow(shop, route);
    // The fallout behind the machines needs the nozzle aimed at them:
    // walk the y=9 aisle facing the back wall and the cone reaches the
    // y=6..8 cells the eastward passes never covered.
    const backWallPass: Array<[number, number]> = [];
    for (let pass = 0; pass < 3; pass++) {
      for (let x = 0; x <= 9; x++) {
        backWallPass.push([x, 9]);
      }
    }
    plow(shop, backWallPass, 1);

    const after = floorDust(shop.shop);
    assert.ok(
      after < mess * 0.15,
      `the vac should clean nearly everything: ${mess} -> ${after}`,
    );
    const canister = shop.shop.shopVac!.canister;
    const held = Object.values(canister).reduce((a, b) => a + (b ?? 0), 0);
    assert.ok(
      held > mess * 0.8,
      `the canister should hold the mess: ${held} of ${mess}`,
    );
    assert.strictEqual(
      shop.shop.materialPiles.some(
        (pile) => pile.material.type === "sawdustPile",
      ),
      false,
      "the vac makes no piles",
    );

    // The trip: stand at the can and hold until the canister runs dry
    shop.standAt([2, 13]).apply(setOperatingAction(true));
    let guard = 0;
    while (
      Object.values(shop.shop.shopVac!.canister).some((v) => (v ?? 0) > 0)
    ) {
      shop.tick();
      assert.ok(guard++ < 100, "emptying should finish in a few ticks");
    }
    shop.apply(setOperatingAction(false));
    assert.deepStrictEqual(shop.shop.shopVac!.canister, {});
  });
});
