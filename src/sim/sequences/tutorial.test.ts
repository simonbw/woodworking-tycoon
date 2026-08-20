import assert from "node:assert";
import { describe, it } from "node:test";
import { hasOneMiteredEnd } from "../../game/board-helpers";
import { initialGameState } from "../../game/initialGameState";
import { Board, MaterialInstance } from "../../game/Materials";
import { TOOL_TYPES } from "../../game/Tool";
import {
  currentTutorialGoalView,
  currentTutorialStep,
  TUTORIAL_MONEY_GOAL,
  TutorialStepId,
} from "../../game/tutorial";
import { ShopDriver } from "../driver/ShopDriver";

/**
 * The guided opening, followed the way a new player follows it: read the
 * to-do card, do exactly what the first unchecked box says, watch it tick.
 * Every move goes through the real commands, so this is the proof that each
 * instruction is both reachable from the one before it and sufficient to
 * satisfy its box — the list can neither strand the player nor skip ahead
 * of them.
 *
 * The interesting assertion is the step id after each move. A box that
 * quietly fails to tick would leave the card repeating itself forever in a
 * shop where the work is already done.
 */

const WORKBENCH = "workspace";

const isPallet = (m: MaterialInstance) => m.type === "pallet";
const isRusticShelf = (m: MaterialInstance) => m.type === "rusticShelf";
const isBirdhouse = (m: MaterialInstance) => m.type === "birdhouse";
const isPalletBoard = (m: MaterialInstance) =>
  m.type === "board" && (m as { species: string }).species === "pallet";
const palletBoardOfLength = (length: number) => (m: MaterialInstance) =>
  isPalletBoard(m) && (m as Board).length === length;
const isMiteredTwelve = (m: MaterialInstance) =>
  palletBoardOfLength(12)(m) && hasOneMiteredEnd(m as Board, 45);

/** What the opening's card is telling the player to do right now. */
function step(shop: ShopDriver): TutorialStepId | undefined {
  // One engine frame runs the milestone pass over the world as it stands.
  shop.stepEngine(1);
  return currentTutorialStep(shop.shop, "opening")?.id;
}

function dismantleAPallet(shop: ShopDriver): ShopDriver {
  // No plan gets selected: a staged pallet offers prying on its own, and
  // the freed boards stay lying on the bench until they're taken off.
  return shop
    .standAtOperatorCell(WORKBENCH)
    .load(WORKBENCH, isPallet, 1)
    .run(WORKBENCH)
    .takeStock(WORKBENCH);
}

function buildRusticShelf(shop: ShopDriver): ShopDriver {
  // Whole boards only: once the birdhouse's cuts exist, the shop holds
  // offcuts a bare species check would scoop up.
  return shop
    .select(WORKBENCH, "buildRusticPalletShelf")
    .load(WORKBENCH, palletBoardOfLength(36), 6)
    .run(WORKBENCH)
    .collect(WORKBENCH);
}

/** One hand-saw cut at the miter box: pick a board by length, keep
 * `targetLength` of it at the given angle stop. */
function sawCut(
  shop: ShopDriver,
  fromLength: number,
  targetLength: number,
  angle: number,
): ShopDriver {
  return shop.make(WORKBENCH, "handSawCut", palletBoardOfLength(fromLength), {
    parameters: { angle, cutEnd: "right", targetLength },
    count: 1,
  });
}

/** The birdhouse's cut list off two full pallet boards: two mitered 12"
 * fronts, a 12" roof, a 12" floor, two 6" sides (see BIRDHOUSE_BLUEPRINT).
 * The first cut is the 45° one; every piece after that falls square. */
function cutBirdhouseParts(shop: ShopDriver): ShopDriver {
  sawCut(shop, 36, 12, 45); // front #1, and a 24" offcut with a mitered end
  sawCut(shop, 24, 12, 0); // front #2 keeps that miter; the rest is the roof
  sawCut(shop, 36, 12, 0); // the floor, and a fresh 24" offcut
  sawCut(shop, 24, 6, 0); // side #1
  sawCut(shop, 18, 6, 0); // side #2
  return shop;
}

function assembleBirdhouse(shop: ShopDriver): ShopDriver {
  return shop
    .select(WORKBENCH, "buildBirdhouse")
    .load(WORKBENCH, isMiteredTwelve, 2)
    .load(
      WORKBENCH,
      (m) => palletBoardOfLength(12)(m) && !isMiteredTwelve(m),
      2,
    )
    .load(WORKBENCH, palletBoardOfLength(6), 2)
    .run(WORKBENCH)
    .collect(WORKBENCH);
}

/** The checkbox states of the opening's current goal, keyed by step id. */
function checkedBoxes(shop: ShopDriver): Record<string, boolean> {
  const view = currentTutorialGoalView(shop.shop, "opening");
  assert.ok(view, "the card is up");
  return Object.fromEntries(
    view.goal.steps.map((s, i) => [s.id, view.checked[i]]),
  );
}

describe("the guided opening", () => {
  it("walks a new shop through every box on the to-do list", () => {
    const shop = new ShopDriver({ state: initialGameState });
    assert.strictEqual(step(shop), "scavenge", "a new save opens on box one");

    shop.scavenge();
    assert.strictEqual(step(shop), "dismantle", "a pallet is home");

    shop.takeFromFloor(isPallet, 1);
    dismantleAPallet(shop);
    assert.strictEqual(step(shop), "buildShelf", "the shelf's parts are pried");

    buildRusticShelf(shop);
    assert.strictEqual(step(shop), "sellShelf", "the shelf exists");
    assert.deepStrictEqual(
      checkedBoxes(shop),
      { scavenge: true, dismantle: true, buildShelf: true, sellShelf: false },
      "the first goal's done boxes are ticked, the sale box is not",
    );

    shop.putEverythingDown().setOut(isRusticShelf);
    assert.strictEqual(
      step(shop),
      "sellShelf",
      "set out is not sold — the box holds until the money exists",
    );

    shop.awaitSales(1);
    assert.strictEqual(step(shop), "learnSkill", "the shelf sold");
    assert.ok(
      shop.shop.progression.storeUnlocked,
      "the first sale opened the store",
    );
    assert.ok(
      shop.shop.progression.skillPoints > 0,
      "the first build's level-up is already waiting when the list asks",
    );
    assert.ok(
      shop.shop.money >= TOOL_TYPES.handSaw.cost,
      `the shelf sale ($${shop.shop.money}) covers the hand saw ` +
        `($${TOOL_TYPES.handSaw.cost})`,
    );

    shop.learn("rusticProjects");
    assert.strictEqual(step(shop), "goToStore", "the skill is learned");

    shop.goShopping("orangeBox");
    assert.strictEqual(step(shop), "grabCart", "the trip is underway");

    shop.takeCart();
    assert.strictEqual(step(shop), "addSawToCart", "the flatbed is in hand");

    shop.buyTool("handSaw");
    assert.strictEqual(step(shop), "checkOut", "the saw is in the cart");

    shop.comeHome();
    // The shelf left five pried boards behind and the birdhouse needs two,
    // so "scavenge another pallet if needed" ticks itself: the wood is
    // already on hand.
    assert.strictEqual(step(shop), "mountSaw", "home with the saw");
    assert.strictEqual(
      checkedBoxes(shop).gatherWood,
      true,
      "the if-needed box ticked itself off the leftover boards",
    );

    shop.mount(WORKBENCH, "handSaw");
    assert.strictEqual(step(shop), "cutParts", "the saw is on the bench");

    cutBirdhouseParts(shop);
    assert.strictEqual(step(shop), "assembleBirdhouse", "the parts are cut");

    assembleBirdhouse(shop);
    assert.strictEqual(step(shop), "earnSavings", "the birdhouse exists");

    // The last box is the savings goal. Selling is the only income, so
    // the walk there is the birdhouse plus shelf rounds; the guard is a
    // ceiling, not an expectation.
    shop.putEverythingDown().setOut(isBirdhouse).awaitSales(1);
    let rounds = 0;
    while (shop.shop.money < TUTORIAL_MONEY_GOAL && rounds < 40) {
      shop.scavenge().takeFromFloor(isPallet, 1);
      dismantleAPallet(shop);
      buildRusticShelf(shop);
      shop.putEverythingDown().setOut(isRusticShelf).awaitSales(1);
      rounds++;
    }
    assert.ok(
      shop.shop.money >= TUTORIAL_MONEY_GOAL,
      `$${shop.shop.money} after ${rounds} shelf rounds — the savings box ` +
        `never ticked`,
    );
    assert.strictEqual(step(shop), undefined, "the coach retires");
  });

  it("skips forward past work the player did out of order", () => {
    // A player who ignores the card and builds the shelf anyway shouldn't
    // find it still asking them to go scavenging.
    const shop = new ShopDriver({ state: initialGameState });
    shop.scavenge().takeFromFloor(isPallet, 1);
    dismantleAPallet(shop);
    buildRusticShelf(shop);
    assert.strictEqual(step(shop), "sellShelf");
  });

  it("keeps selling as the reputation engine: sales reach the lumberyard gate", () => {
    // The stand is the game's only reputation source now, so the walk
    // from a fresh shop to the lumberyard's gate has to be pure
    // scavenge-build-sell. This is the slimmed-down progression ledger:
    // reachability, not exact numbers.
    const shop = new ShopDriver({ state: initialGameState });
    let guard = 0;
    while (!shop.shop.progression.lumberyardUnlocked && guard < 20) {
      shop.scavenge().takeFromFloor(isPallet, 1);
      dismantleAPallet(shop);
      buildRusticShelf(shop);
      shop.putEverythingDown().setOut(isRusticShelf).awaitSales(1);
      shop.stepEngine(1);
      guard++;
    }
    assert.ok(
      shop.shop.progression.lumberyardUnlocked,
      `the lumberyard never opened — ${shop.shop.reputation} reputation ` +
        `after ${guard} shelves`,
    );
  });
});
