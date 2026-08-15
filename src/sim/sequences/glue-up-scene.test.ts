/**
 * The clamps-first glue-up, driven the way the bench view drives it: no
 * plan selected, stock laid edge to edge on the bench (real arrange
 * commits), the run claimed through startGlueUp, the cure ticked
 * out. What the five fixed recipes never allowed is the point here —
 * an arbitrary strip count — plus the gates that guard the commit: the
 * clamp rack and the skills the composition demands.
 *
 * Rehosted from `src/game/sequences/glue-up-scene.test.ts` onto the
 * entity-world ShopDriver — the parity spec for the sim.
 *
 * The fixture stages three strips in the bench's bay and carries two
 * more, so a bare openShop already holds a three-strip run.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { cuttingBoardShop } from "../../../tests/fixtures/cutting-board-shop";
import { GameState } from "../../game/GameState";
import { isPanel } from "../../game/panel-helpers";
import { MaterialInstance, panelWidth } from "../../game/Materials";
import { ShopDriver } from "../driver/ShopDriver";
import { Consumables } from "../singletons/Consumables";
import { Progression } from "../singletons/Progression";

const WORKBENCH = "workspace";

const twoStrips = (m: MaterialInstance) =>
  m.id === "test-strip-2" || m.id === "test-strip-3";

/** Open a shop from a fixture and start working it. */
function openShop(state: GameState): ShopDriver {
  return new ShopDriver({ state });
}

function withSkill(shop: ShopDriver, skill: string): ShopDriver {
  return shop.arrange((game) => {
    const progression = game.entities.getSingleton(Progression);
    progression.unlockedSkills = [
      ...progression.unlockedSkills,
      skill as never,
    ];
  });
}

describe("clamps-first glue-up (scene path)", () => {
  it("glues an arbitrary count — three strips make a 6-inch panel", () => {
    const shop = openShop(cuttingBoardShop);
    shop.glueUp(WORKBENCH);

    const panel = shop.theOne(isPanel);
    assert.ok(isPanel(panel));
    assert.strictEqual(panel.strips.length, 3);
    assert.strictEqual(panelWidth(panel), 6);
    assert.strictEqual(panel.surface, "rough");
    // The composition decided the credited recipe
    assert.strictEqual(
      shop.machine(WORKBENCH).state.selectedOperationId,
      "glueUpPanel",
    );
  });

  it("a bare pair is freeform lamination's move, not panel work's", () => {
    const locked = openShop(cuttingBoardShop);
    assert.throws(() => locked.glueUp(WORKBENCH, twoStrips), /would not start/);

    const learned = withSkill(openShop(cuttingBoardShop), "freeformLamination");
    learned.glueUp(WORKBENCH, twoStrips);
    assert.strictEqual(
      learned.machine(WORKBENCH).state.selectedOperationId,
      "glueUpPair",
    );
    const pair = learned.theOne(isPanel);
    assert.ok(isPanel(pair));
    assert.strictEqual(pair.strips.length, 2);
  });

  it("the run is refused when the rack is short of clamps", () => {
    const shop = openShop(cuttingBoardShop).arrange((game) => {
      game.entities.getSingleton(Consumables).clamps = 1;
    });
    assert.throws(() => shop.glueUp(WORKBENCH), /would not start/);
  });

  it("holds the clamps through the cure and returns them after", () => {
    const shop = openShop(cuttingBoardShop);
    const owned = shop.shop.clamps;
    shop.glueUp(WORKBENCH);
    // glueUp ticks the cure out, so by now they're back on the rack
    assert.strictEqual(shop.shop.clamps, owned);
    assert.strictEqual(
      shop.machine(WORKBENCH).state.operationProgress.status,
      "notStarted",
    );
  });
});
