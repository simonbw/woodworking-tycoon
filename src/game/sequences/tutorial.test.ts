import assert from "node:assert";
import { describe, it } from "node:test";
import { checkProgressionMilestonesAction } from "../game-actions/progression-actions";
import { initialGameState } from "../initialGameState";
import { MaterialInstance } from "../Materials";
import { currentTutorialStep, TutorialStepId } from "../tutorial";
import { openShop, ShopDriver } from "./shop-driver";

/**
 * The guided opening, followed the way a new player follows it: read the
 * card, do exactly what it says, read the next card. Every move goes
 * through the real actions, so this is the proof that each instruction is
 * both reachable from the one before it and sufficient to satisfy the
 * step — the coach can neither strand the player nor skip ahead of them.
 *
 * The interesting assertion is the step id after each move. A step that
 * quietly fails to advance would leave the card repeating itself forever
 * in a shop where the work is already done.
 */

const WORKBENCH = "workspace";

const isPallet = (m: MaterialInstance) => m.type === "pallet";
const isRusticShelf = (m: MaterialInstance) => m.type === "rusticShelf";
const isPalletBoard = (m: MaterialInstance) =>
  m.type === "board" && (m as { species: string }).species === "pallet";

/** What the card is telling the player to do right now. */
function step(shop: ShopDriver): TutorialStepId | undefined {
  shop.apply(checkProgressionMilestonesAction());
  return currentTutorialStep(shop.shop)?.id;
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
  return shop
    .select(WORKBENCH, "buildRusticPalletShelf")
    .load(WORKBENCH, isPalletBoard, 6)
    .run(WORKBENCH)
    .collect(WORKBENCH);
}

describe("the guided opening", () => {
  it("walks a new shop through every step, one instruction at a time", () => {
    const shop = openShop(initialGameState);
    assert.strictEqual(step(shop), "scavenge", "a new save opens on step one");

    shop.scavenge();
    assert.strictEqual(step(shop), "dismantle", "a pallet is home");

    shop.takeFromFloor(isPallet, 1);
    dismantleAPallet(shop);
    assert.strictEqual(step(shop), "buildShelf", "the shelf's parts are pried");

    buildRusticShelf(shop);
    assert.strictEqual(step(shop), "sellShelf", "the shelf exists");

    shop.putEverythingDown().setOut(isRusticShelf);
    assert.strictEqual(
      step(shop),
      "sellShelf",
      "set out is not sold — the card holds until the money exists",
    );

    shop.awaitSales(1);
    assert.strictEqual(step(shop), "buySandingBlock", "the shelf sold");
    assert.ok(
      shop.shop.progression.storeUnlocked,
      "the first sale opened the store",
    );
    assert.ok(shop.shop.money >= 10, "the sale covers the sanding block");

    shop.goShopping("orangeBox").buyTool("sandingBlock").comeHome();
    assert.strictEqual(step(shop), "mountSandingBlock", "the block is bought");

    shop.mount(WORKBENCH, "sandingBlock");
    assert.strictEqual(step(shop), "learnSkill", "the block is on the bench");

    // The last step asks the player to spend a point, so the point has to
    // have arrived by the time the card asks — XP comes from finished
    // work, which is what the card says to keep doing. Six rounds is a
    // ceiling, not an expectation; the assertion below is what matters.
    let rounds = 0;
    while (shop.shop.progression.skillPoints === 0 && rounds < 6) {
      shop.putEverythingDown().scavenge().takeFromFloor(isPallet, 1);
      dismantleAPallet(shop);
      buildRusticShelf(shop);
      rounds++;
    }
    assert.ok(
      shop.shop.progression.skillPoints > 0,
      `no skill point after ${rounds} rounds of shelf work — the last step ` +
        `asks the player to spend one`,
    );

    shop.learn("rusticProjects");
    assert.strictEqual(step(shop), undefined, "the coach retires");
  });

  it("skips forward past work the player did out of order", () => {
    // A player who ignores the card and builds the shelf anyway shouldn't
    // find it still asking them to go scavenging.
    const shop = openShop(initialGameState);
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
    const shop = openShop(initialGameState);
    let guard = 0;
    while (!shop.shop.progression.lumberyardUnlocked && guard < 20) {
      shop.scavenge().takeFromFloor(isPallet, 1);
      dismantleAPallet(shop);
      buildRusticShelf(shop);
      shop.putEverythingDown().setOut(isRusticShelf).awaitSales(1);
      shop.apply(checkProgressionMilestonesAction());
      guard++;
    }
    assert.ok(
      shop.shop.progression.lumberyardUnlocked,
      `the lumberyard never opened — ${shop.shop.reputation} reputation ` +
        `after ${guard} shelves`,
    );
  });
});
