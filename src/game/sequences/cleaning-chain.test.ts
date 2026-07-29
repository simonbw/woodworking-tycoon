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
import { setOperatingAction } from "../game-actions/player-actions";
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
 * exactly what plowing is: the sweep runs off the held flag in
 * tickAction while the feet keep moving.
 */
function plow(shop: ShopDriver, route: ReadonlyArray<[number, number]>): void {
  shop.apply(setOperatingAction(true));
  for (const cell of route) {
    shop.standAt(cell).tick();
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

    // Plow the rows below the jointer ([2,2]) and planer ([6,2]) — the
    // swath reaches two cells ahead, so walking the y=5..3 rows facing +x
    // covers both machines' fallout, undersides included. Two passes per
    // row: the under-machine pull is slow by design.
    const route: Array<[number, number]> = [];
    for (const y of [5, 4, 3]) {
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
});
