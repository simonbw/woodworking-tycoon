import assert from "node:assert";
import { describe, it } from "node:test";
import { checkProgressionMilestonesAction } from "../game-actions/progression-actions";
import { MaterialInstance } from "../Materials";
import { currentTutorialStep, TutorialStepId } from "../tutorial";
import { newGame } from "./playthrough";
import { ShopDriver } from "./shop-driver";

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
const palletBoard = (width: number) => (m: MaterialInstance) =>
  m.type === "board" &&
  (m as { species: string }).species === "pallet" &&
  (m as { width: number }).width === width;
const stringer = palletBoard(6);
const deckBoard = palletBoard(4);
const anyPalletBoard = (m: MaterialInstance) =>
  m.type === "board" && (m as { species: string }).species === "pallet";

/** What the card is telling the player to do right now. */
function step(shop: ShopDriver): TutorialStepId | undefined {
  shop.apply(checkProgressionMilestonesAction());
  return currentTutorialStep(shop.shop)?.id;
}

function dismantleAPallet(shop: ShopDriver): ShopDriver {
  shop
    .standAtOperatorCell(WORKBENCH)
    .select(WORKBENCH, "dismantlePallet")
    .load(WORKBENCH, isPallet, 1);
  while (shop.machine(WORKBENCH).state.inputMaterials.length > 0) {
    shop.run(WORKBENCH);
  }
  return shop.collect(WORKBENCH);
}

function buildRusticShelf(shop: ShopDriver): ShopDriver {
  return shop
    .select(WORKBENCH, "buildRusticPalletShelf")
    .load(WORKBENCH, stringer, 2)
    .load(WORKBENCH, deckBoard, 3)
    .run(WORKBENCH)
    .collect(WORKBENCH);
}

describe("the guided opening", () => {
  it("walks a new shop through every step, one instruction at a time", () => {
    const shop = newGame();
    assert.strictEqual(step(shop), "scavenge", "a new save opens on step one");

    shop.scavenge();
    assert.strictEqual(step(shop), "dismantle", "a pallet is home");

    shop.takeFromFloor(isPallet, 1);
    dismantleAPallet(shop);
    assert.strictEqual(step(shop), "buildShelf", "the shelf's parts are pried");

    buildRusticShelf(shop);
    assert.strictEqual(step(shop), "loadShelf", "the shelf exists");

    shop.putEverythingDown().takeFromFloor(isRusticShelf, 1).loadBed();
    assert.strictEqual(step(shop), "deliverShelf", "the shelf rides in the bed");

    shop.handOverCommission();
    assert.strictEqual(step(shop), "listStock", "Marguerite has her shelf");
    // The two unlocks the marketplace half of the tutorial depends on
    assert.ok(shop.shop.progression.marketplaceUnlocked, "the phone arrived");
    assert.ok(shop.shop.progression.storeUnlocked, "the store opened");

    shop.putEverythingDown().list(anyPalletBoard).awaitListingSales();
    assert.strictEqual(step(shop), "acceptJob", "spare wood is sold");

    shop.seedJobBoard();
    const offer = shop.shop.jobBoard.find((candidate) => candidate.materialCostFree);
    assert.ok(offer, "the board always carries a material-free offer");
    shop.acceptJob(offer.id);
    assert.strictEqual(step(shop), "buySandingBlock", "a job is accepted");

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
    const shop = newGame();
    shop.scavenge().takeFromFloor(isPallet, 1);
    dismantleAPallet(shop);
    buildRusticShelf(shop);
    assert.strictEqual(step(shop), "loadShelf");
  });
});
