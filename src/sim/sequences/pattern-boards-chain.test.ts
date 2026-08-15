/**
 * The two pattern-board tiers, worked end to end.
 *
 * `machines/pattern-boards.test.ts` covers the recipes one at a time — what
 * counts as strict alternation, what counts as a fade, how a tie in width
 * picks the dominant species. This asks the next question up: whether you can
 * actually get from six graduated strips to a sunrise board by gluing them on
 * in order, and whether the two boards together pay what the ladder says.
 *
 * `pattern-boards.spec.ts` used to do all of this through the browser at
 * about sixteen seconds a run — the longest test in the suite. It now checks
 * only the journal gating and the bench's recipe list.
 *
 * Rehosted from `src/game/sequences/pattern-boards-chain.test.ts` onto the
 * entity world's driver — the parity spec for the sim (MIGRATION.md phase 2).
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { patternBoardShop } from "../../../tests/fixtures/pattern-board-shop";
import { isPanel } from "../../game/panel-helpers";
import { getMaterialName } from "../../game/material-helpers";
import { MaterialInstance } from "../../game/Materials";
import { availableOperations } from "../../game/skill-helpers";
import { ShopDriver } from "../driver/ShopDriver";
import { Progression } from "../singletons/Progression";

const WORKBENCH = "workspace";

/** The three skills this chain spends its points on, in dependency order. */
const PATTERN_SKILLS = [
  "stripedBoards",
  "freeformLamination",
  "sunriseBoards",
] as const;

const isMixedPanel = (m: MaterialInstance) => isPanel(m);
const isStripedBoard = (m: MaterialInstance) =>
  m.type === "stripedCuttingBoard";
const isSunriseBoard = (m: MaterialInstance) =>
  m.type === "sunriseCuttingBoard";

/** A strip by species and width, the way the fixture stocks them. */
const strip = (species: string, width: number) => (m: MaterialInstance) =>
  m.type === "board" &&
  (m as { species: string }).species === species &&
  (m as { width: number }).width === width;

function shopWithPatternSkills(): ShopDriver {
  return new ShopDriver({ state: patternBoardShop }).arrange((game) => {
    const progression = game.entities.getSingleton(Progression);
    progression.skillPoints = 0;
    progression.unlockedSkills = [
      ...progression.unlockedSkills,
      ...PATTERN_SKILLS,
    ];
  });
}

/**
 * Glue the six graduated strips into the fade: a seed pair, then one strip at
 * a time. Walnut narrows 3-2-1 as maple widens 1-2-3, which is what makes it
 * a sunrise rather than a stripe.
 */
function glueTheSunriseFade(shop: ShopDriver): ShopDriver {
  shop
    .standAtOperatorCell(WORKBENCH)
    .select(WORKBENCH, "glueUpPair")
    .load(WORKBENCH, (m) => strip("walnut", 3)(m) || strip("maple", 1)(m))
    .run(WORKBENCH)
    .collect(WORKBENCH);

  const fade = [
    strip("walnut", 2),
    strip("maple", 2),
    strip("walnut", 1),
    strip("maple", 3),
  ];
  shop.select(WORKBENCH, "extendPanel");
  for (const [index, next] of fade.entries()) {
    shop
      .load(WORKBENCH, (m) => isMixedPanel(m) || next(m))
      .run(WORKBENCH)
      .collect(WORKBENCH);
    const panel = shop.theOne(isMixedPanel);
    assert.ok(isPanel(panel));
    // Seed pair is 2 strips; each pass adds one.
    assert.equal(panel.strips.length, 3 + index);
  }
  return shop;
}

describe("pattern board chain", () => {
  it("hides the freeform bench ops until the skills are learned", () => {
    const locked = new ShopDriver({ state: patternBoardShop });
    const lockedIds = availableOperations(
      locked.machine(WORKBENCH).view(),
      locked.shop.progression,
    ).map((op) => op.id);
    assert.ok(!lockedIds.includes("glueUpPair"));
    assert.ok(!lockedIds.includes("finishStripedBoard"));

    const learned = shopWithPatternSkills();
    const learnedIds = availableOperations(
      learned.machine(WORKBENCH).view(),
      learned.shop.progression,
    ).map((op) => op.id);
    for (const id of [
      "glueUpPair",
      "extendPanel",
      "finishStripedBoard",
      "finishSunriseBoard",
    ]) {
      assert.ok(learnedIds.includes(id), `expected the bench to offer ${id}`);
    }
  });

  // The names below are what getMaterialName returns; the UI title-cases them
  // in CSS, which is why the spec's strings read differently.
  it("finishes the sanded striped blank into a named striped board", () => {
    const shop = shopWithPatternSkills();
    shop.make(WORKBENCH, "finishStripedBoard", isMixedPanel);

    const board = shop.theOne(isStripedBoard);
    assert.equal(
      getMaterialName(board),
      "Walnut & Maple Striped cutting board",
    );
  });

  it("glues six graduated strips into a 12-inch fade", () => {
    const shop = shopWithPatternSkills();
    // Finish the striped blank first so the only panel left is the fade.
    shop.make(WORKBENCH, "finishStripedBoard", isMixedPanel);
    glueTheSunriseFade(shop);

    const panel = shop.theOne(isMixedPanel);
    assert.ok(isPanel(panel));
    // 3 + 1 + 2 + 2 + 1 + 3 = 12"
    assert.equal(getMaterialName(panel), "Mixed Wood Panel 4/4 — 12\" × 2'");
  });

  it("names the sunrise board for its dominant wood, accent second", () => {
    const shop = shopWithPatternSkills();
    shop.make(WORKBENCH, "finishStripedBoard", isMixedPanel);
    glueTheSunriseFade(shop);
    shop
      .make(WORKBENCH, "orbitSandPanel", isMixedPanel)
      .make(WORKBENCH, "orbitSandPanel", isMixedPanel)
      .make(WORKBENCH, "finishSunriseBoard", isMixedPanel);

    const board = shop.theOne(isSunriseBoard) as {
      species: string;
      accentSpecies: string;
    };
    assert.equal(board.species, "walnut");
    assert.equal(board.accentSpecies, "maple");
    assert.equal(
      getMaterialName(board as unknown as MaterialInstance),
      "Walnut & Maple Sunrise cutting board",
    );
  });

  it("pays 192 XP for both boards, which is level 5 and 4 points back", () => {
    const shop = shopWithPatternSkills();
    shop.make(WORKBENCH, "finishStripedBoard", isMixedPanel);
    glueTheSunriseFade(shop);
    shop
      .make(WORKBENCH, "orbitSandPanel", isMixedPanel)
      .make(WORKBENCH, "orbitSandPanel", isMixedPanel)
      .make(WORKBENCH, "finishSunriseBoard", isMixedPanel);

    // Striped $72 + sunrise $120 = 192 XP -> level 5 -> the 3 points this
    // chain spent on Striped, Freeform, and Sunrise come back with one
    // to spare.
    assert.equal(shop.shop.progression.xp, 192);
    assert.equal(shop.shop.progression.skillPoints, 4);
  });
});
