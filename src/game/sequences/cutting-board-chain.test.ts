/**
 * Five smooth strips to a sellable cutting board, with no planer in the shop.
 *
 * `machines/cutting-board-chain.test.ts` covers the recipes; the point of
 * running them in order is the fixture's premise — that a sander bought off
 * the tool wall is enough, and the planer only ever buys time. If a recipe
 * ever starts quietly demanding a thickness only a planer reaches, this is
 * what fails.
 *
 * `cutting-board.spec.ts` keeps the store, the lumberyard, and the tool rack;
 * the glue-sand-finish run that used to follow them lives here.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { cuttingBoardShop } from "../../../tests/fixtures/cutting-board-shop";
import { isPanel } from "../panel-helpers";
import {
  getMaterialFullName,
  getMaterialName,
} from "../material-helpers";
import { getSellValue } from "../material-values";
import { MaterialInstance } from "../Materials";
import { openShop, ShopDriver } from "./shop-driver";

const WORKBENCH = "workspace";

const isStrip = (m: MaterialInstance) => m.type === "board";
const isMaplePanel = (m: MaterialInstance) => isPanel(m);
const isCuttingBoard = (m: MaterialInstance) =>
  m.type === "simpleCuttingBoard";

/** The sander comes in tool storage; the spec mounts it through the sheet. */
function shopWithSanderMounted(): ShopDriver {
  return openShop(cuttingBoardShop).mount(WORKBENCH, "randomOrbitSander");
}

describe("cutting board chain (no planer)", () => {
  it("mounting the sander is what adds the sanding recipe", () => {
    const bare = openShop(cuttingBoardShop);
    assert.throws(
      () => bare.select(WORKBENCH, "orbitSandPanel"),
      /does not offer "orbitSandPanel"/,
    );

    shopWithSanderMounted().select(WORKBENCH, "orbitSandPanel");
  });

  it("glues five smooth strips into one rough 10-inch panel", () => {
    const shop = shopWithSanderMounted();
    shop.make(WORKBENCH, "glueUpPanel", isStrip);

    const panel = shop.theOne(isMaplePanel);
    assert.ok(isPanel(panel));
    assert.equal(getMaterialName(panel), "Maple Panel 4/4 — 10\" × 2'");
    // The row the manifest shows, surface and all — a fresh glue-up is rough
    assert.equal(
      getMaterialFullName(panel),
      "Maple Panel 4/4 — 10\" × 2' (rough)",
    );
  });

  it("sands rough to smooth to sanded, one pass each", () => {
    const shop = shopWithSanderMounted();
    shop.make(WORKBENCH, "glueUpPanel", isStrip);

    for (const surface of ["smooth", "sanded"] as const) {
      shop.make(WORKBENCH, "orbitSandPanel", isMaplePanel);
      assert.equal(
        getMaterialFullName(shop.theOne(isMaplePanel)),
        `Maple Panel 4/4 — 10" × 2' (${surface})`,
      );
    }
  });

  it("finishes at full thickness — the planer is time, not access", () => {
    const shop = shopWithSanderMounted();
    const startingThickness = 4;
    shop
      .make(WORKBENCH, "glueUpPanel", isStrip)
      .make(WORKBENCH, "orbitSandPanel", isMaplePanel)
      .make(WORKBENCH, "orbitSandPanel", isMaplePanel);

    const sanded = shop.theOne(isMaplePanel);
    assert.ok(isPanel(sanded));
    // Nothing in this chain takes a pass off: no planer, no thickness lost.
    assert.equal(sanded.thickness, startingThickness);

    shop.make(WORKBENCH, "finishCuttingBoard", isMaplePanel);
    const board = shop.theOne(isCuttingBoard);
    assert.equal((board as { species: string }).species, "maple");
  });

  it("prices the maple board at 24", () => {
    const shop = shopWithSanderMounted();
    shop
      .make(WORKBENCH, "glueUpPanel", isStrip)
      .make(WORKBENCH, "orbitSandPanel", isMaplePanel)
      .make(WORKBENCH, "orbitSandPanel", isMaplePanel)
      .make(WORKBENCH, "finishCuttingBoard", isMaplePanel);

    // simpleCuttingBoard base 8 x maple multiplier 3
    assert.equal(getSellValue(shop.theOne(isCuttingBoard)), 24);
  });
});
