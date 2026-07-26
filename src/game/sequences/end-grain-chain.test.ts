/**
 * The end-grain board, start to finish, as a run of work.
 *
 * The recipes themselves are covered in `machines/end-grain.test.ts` — what
 * this asks is whether the chain holds together when you actually do it in
 * order: whether the sled you build mounts on the saw that needs it, whether
 * four slices come off one panel, whether the glue-up that follows accepts
 * them, and whether the board at the end is worth what the ladder says.
 *
 * `end-grain.spec.ts` used to answer all of that through the browser at
 * about ten seconds a run. It now only checks that the UI exposes the chain.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { endGrainShop } from "../../../tests/fixtures/end-grain-shop";
import { GameState } from "../GameState";
import { SLICES_PER_PANEL } from "../tools/crosscutSled";
import { isPanel } from "../panel-helpers";
import { getMaterialName, makeMaterial } from "../material-helpers";
import { MaterialInstance, SheetGood } from "../Materials";
import { openShop, ShopDriver } from "./shop-driver";

const WORKBENCH = "workspace";
const TABLE_SAW = "jobsiteTableSaw";

const isPlywood = (m: MaterialInstance) => m.type === "plywood";
const isPalletWood = (m: MaterialInstance) =>
  m.type === "board" && m.species === "pallet";
const isSlice = (m: MaterialInstance) => m.type === "endGrainSlice";
const isEndGrainPanel = (m: MaterialInstance) =>
  isPanel(m) && m.grain === "end";
const isBoard = (m: MaterialInstance) => m.type === "endGrainCuttingBoard";

/** The jig-grade sheet the spec buys off the Sheet Goods aisle. */
function shopPlywood(): SheetGood {
  return makeMaterial<SheetGood>({
    type: "plywood",
    kind: "plywoodB",
    length: 4,
    width: 4,
    thickness: 2,
  });
}

/**
 * The fixture stops short of the two skills and the plywood, because the
 * spec buys and learns those through the store and journal — the parts that
 * are still worth a browser. Everything downstream starts from here.
 */
function shopWithSkillsAndPlywood(): ShopDriver {
  return openShop(endGrainShop)
    .arrange((state: GameState) => ({
      ...state,
      progression: {
        ...state.progression,
        skillPoints: 0,
        unlockedSkills: [
          ...state.progression.unlockedSkills,
          "jigsAndFixtures",
          "endGrainBoards",
        ],
      },
    }))
    .arrange((state) => ({
      ...state,
      player: {
        ...state.player,
        inventory: [...state.player.inventory, shopPlywood()],
      },
    }));
}

/** Build the sled and bolt it to the saw. */
function withSledMounted(shop: ShopDriver): ShopDriver {
  shop
    .standAtOperatorCell(WORKBENCH)
    .select(WORKBENCH, "buildCrosscutSled")
    .load(WORKBENCH, (m) => isPlywood(m) || isPalletWood(m))
    .run(WORKBENCH);
  return shop.mount(TABLE_SAW, "crosscutSled");
}

describe("end-grain chain", () => {
  it("delivers the sled to storage rather than to your hands", () => {
    const shop = shopWithSkillsAndPlywood();
    shop
      .standAtOperatorCell(WORKBENCH)
      .select(WORKBENCH, "buildCrosscutSled")
      .load(WORKBENCH, (m) => isPlywood(m) || isPalletWood(m))
      .run(WORKBENCH);

    assert.deepStrictEqual(shop.shop.storage.tools, ["crosscutSled"]);
    assert.equal(shop.holding(isPlywood).length, 0);
  });

  it("only offers the crosscut once the sled is on the saw", () => {
    const shop = shopWithSkillsAndPlywood();
    assert.throws(
      () => shop.select(TABLE_SAW, "crosscutPanel"),
      /does not offer "crosscutPanel"/,
    );

    withSledMounted(shop);
    shop.select(TABLE_SAW, "crosscutPanel");
  });

  it("slices one sanded panel into four", () => {
    const shop = withSledMounted(shopWithSkillsAndPlywood());
    shop.make(TABLE_SAW, "crosscutPanel", isPanel);

    assert.equal(shop.holding(isSlice).length, SLICES_PER_PANEL);
  });

  it("glues the slices grain-up into one rough end-grain panel", () => {
    const shop = withSledMounted(shopWithSkillsAndPlywood());
    shop
      .make(TABLE_SAW, "crosscutPanel", isPanel)
      .make(WORKBENCH, "glueUpEndGrain", isSlice);

    assert.equal(shop.holding(isSlice).length, 0);
    const panel = shop.theOne(isEndGrainPanel);
    assert.ok(isPanel(panel));
    assert.equal(panel.surface, "rough");
    assert.equal(panel.thickness, 8);
    // The name the manifest and every recipe list show it under. Four 5-strip
    // slices stood on end make a panel as deep as the slices were thick.
    assert.equal(
      getMaterialName(panel),
      "Maple End-Grain Panel 8/4 — 10\" × 1'",
    );
  });

  it("sands the blank rough to smooth to sanded, one pass each", () => {
    const shop = withSledMounted(shopWithSkillsAndPlywood());
    shop
      .make(TABLE_SAW, "crosscutPanel", isPanel)
      .make(WORKBENCH, "glueUpEndGrain", isSlice);

    for (const expected of ["smooth", "sanded"] as const) {
      shop.make(WORKBENCH, "orbitSandPanel", isEndGrainPanel);
      const panel = shop.theOne(isEndGrainPanel);
      assert.ok(isPanel(panel));
      assert.equal(panel.surface, expected);
    }
  });

  it("finishes into a maple board worth 450, which is level 3", () => {
    const shop = withSledMounted(shopWithSkillsAndPlywood());
    shop
      .make(TABLE_SAW, "crosscutPanel", isPanel)
      .make(WORKBENCH, "glueUpEndGrain", isSlice)
      .make(WORKBENCH, "orbitSandPanel", isEndGrainPanel)
      .make(WORKBENCH, "orbitSandPanel", isEndGrainPanel)
      .make(WORKBENCH, "finishEndGrainBoard", isEndGrainPanel);

    const board = shop.theOne(isBoard);
    assert.equal((board as { species: string }).species, "maple");
    // A $450 board pays 450 XP, which is level 3 — and level 3 hands back
    // the two points this chain spent on Jigs & Fixtures and End-Grain.
    assert.equal(shop.shop.progression.xp, 450);
    assert.equal(shop.shop.progression.skillPoints, 2);
  });
});
