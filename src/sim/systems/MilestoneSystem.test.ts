import assert from "node:assert";
import { describe, it } from "node:test";
import { makePallet } from "../../game/material-helpers";
import { LUMBERYARD_MIN_REPUTATION } from "../../game/lumberStock";
import { STARTER_SKILLS } from "../../game/Skill";
import { currentTutorialStep } from "../../game/tutorial";
import {
  dismissTutorial,
  markArticlesRead,
  spendSkillPoint,
} from "../commands/progression-commands";
import { ShopDriver } from "../driver/ShopDriver";
import { projectGameState } from "../projection";
import { DustLayer } from "../singletons/DustLayer";
import { grantXp } from "./grants";

/**
 * The milestone pass: the one-way unlock flags, the manual's article
 * reveals, and the tutorial ratchet, evaluated against the projection
 * and written onto the singletons.
 *
 * Arrangement writes singletons directly (dust on the DustLayer, sales
 * on Progression) because the systems that would earn them — the stand,
 * sweeping — aren't ported yet; the milestone pass only reads the
 * projection, so it lights up the same way either way.
 *
 * Raw engine steps (no sim minute) drive most of these on purpose: the
 * pass answering player actions between minutes is the ported real-time
 * cadence the old Ticker provided.
 */

describe("the milestone pass", () => {
  it("unlocks the store on the first sale, one-way", () => {
    const shop = new ShopDriver();
    shop.stepEngine(1);
    assert.strictEqual(shop.progression.storeUnlocked, false);

    shop.progression.salesCompleted = 1;
    shop.stepEngine(1);
    assert.ok(shop.progression.storeUnlocked, "the first sale opens the store");
  });

  it("unlocks the lumberyard at the reputation gate, and keeps it", () => {
    const shop = new ShopDriver();
    shop.reputation.reputation = LUMBERYARD_MIN_REPUTATION - 1;
    shop.stepEngine(1);
    assert.strictEqual(shop.progression.lumberyardUnlocked, false);

    shop.reputation.reputation = LUMBERYARD_MIN_REPUTATION;
    shop.stepEngine(1);
    assert.ok(shop.progression.lumberyardUnlocked);
    assert.ok(
      shop.progression.unlockedArticles.includes("milling"),
      "the milling article lands with the yard's reputation",
    );

    // Unlocks are one-way even if the condition later fails.
    shop.reputation.reputation = 0;
    shop.stepEngine(1);
    assert.ok(shop.progression.lumberyardUnlocked);
    assert.ok(shop.progression.unlockedArticles.includes("milling"));
  });

  it("puts up the sweeping note when the floor gets dusty, article in the same pass", () => {
    const shop = new ShopDriver();
    shop.stepEngine(1);
    assert.strictEqual(shop.progression.sweepingUnlocked, false);

    shop.game.entities.getSingleton(DustLayer).map = { "1,1": { pine: 80 } };
    shop.stepEngine(1);
    assert.ok(shop.progression.sweepingUnlocked);
    assert.ok(
      shop.progression.unlockedArticles.includes("dust"),
      "an article gated on a flag flipped this very pass must not lag",
    );
  });

  it("records newly met articles one-way and never duplicates them", () => {
    const shop = new ShopDriver();
    assert.ok(!shop.progression.unlockedArticles.includes("workbenches"));

    const consumables = shop.consumables;
    consumables.stock = { ...consumables.stock, mineralOil: 16 };
    shop.stepEngine(1);
    assert.ok(shop.progression.unlockedArticles.includes("workbenches"));

    // Condition gone (oil used up), unlock stays; nothing doubles up.
    consumables.stock = { ...consumables.stock, mineralOil: 0 };
    shop.stepEngine(2);
    const ids = shop.progression.unlockedArticles;
    assert.ok(ids.includes("workbenches"));
    assert.strictEqual(new Set(ids).size, ids.length);
  });

  it("reveals the skills article when the first level-up's point lands", () => {
    const shop = new ShopDriver();
    grantXp(shop.game, 9);
    shop.stepEngine(1);
    assert.ok(!shop.progression.unlockedArticles.includes("skills"));
    assert.strictEqual(shop.progression.skillPoints, 0);

    grantXp(shop.game, 1);
    assert.strictEqual(shop.progression.skillPoints, 1, "level 2 pays a point");
    shop.stepEngine(1);
    assert.ok(shop.progression.unlockedArticles.includes("skills"));
  });

  it("walks the tutorial ratchet forward over satisfied steps, sim minutes included", () => {
    const shop = new ShopDriver();
    shop.tick(3);
    assert.strictEqual(
      shop.tutorials.tutorials.opening.step,
      0,
      "a fresh shop opens on box one",
    );
    assert.strictEqual(
      currentTutorialStep(projectGameState(shop.game), "opening")?.id,
      "scavenge",
    );

    // A pallet home from scavenging satisfies box one.
    shop.player.inventory = [makePallet()];
    shop.tick(1);
    assert.strictEqual(shop.tutorials.tutorials.opening.step, 1);
    assert.strictEqual(
      currentTutorialStep(projectGameState(shop.game), "opening")?.id,
      "dismantle",
    );
  });

  it("never walks the ratchet backward once a condition has come and gone", () => {
    const shop = new ShopDriver();
    shop.player.inventory = [makePallet()];
    shop.stepEngine(1);
    assert.strictEqual(shop.tutorials.tutorials.opening.step, 1);

    // The pallet leaves the shop again; the walked box stays ticked.
    shop.player.inventory = [];
    shop.stepEngine(5);
    shop.tick(3);
    assert.strictEqual(shop.tutorials.tutorials.opening.step, 1);
  });

  it("answers player actions on raw engine ticks, before any sim minute passes", () => {
    const shop = new ShopDriver();
    shop.progression.salesCompleted = 1;
    shop.player.inventory = [makePallet()];
    // No forced minutes — the idle creep hasn't accrued one yet.
    shop.stepEngine(1);
    assert.ok(shop.progression.storeUnlocked);
    // The sale satisfies the whole first goal — the cumulative
    // predicates walk the ratchet past all four of its boxes at once.
    assert.strictEqual(shop.tutorials.tutorials.opening.step, 4);
  });
});

describe("dismissTutorial", () => {
  it("retires the card one-way", () => {
    const shop = new ShopDriver();
    assert.strictEqual(shop.tutorials.tutorials.opening.dismissed, false);

    dismissTutorial(shop.game, "opening");
    assert.strictEqual(shop.tutorials.tutorials.opening.dismissed, true);
    assert.strictEqual(
      currentTutorialStep(projectGameState(shop.game), "opening"),
      null,
      "a dismissed card is down",
    );

    // Dismissing again and running the world changes nothing back.
    dismissTutorial(shop.game, "opening");
    shop.tick(2);
    assert.strictEqual(shop.tutorials.tutorials.opening.dismissed, true);
    assert.strictEqual(shop.tutorials.tutorials.dust.dismissed, false);
  });
});

describe("markArticlesRead", () => {
  it("appends only unread articles and no-ops when nothing is new", () => {
    const shop = new ShopDriver();
    markArticlesRead(shop.game, ["welcome"]);
    assert.deepStrictEqual(shop.progression.readArticles, ["welcome"]);

    const before = shop.progression.readArticles;
    markArticlesRead(shop.game, ["welcome"]);
    assert.strictEqual(shop.progression.readArticles, before);

    markArticlesRead(shop.game, ["welcome", "controls"]);
    assert.deepStrictEqual(shop.progression.readArticles, [
      "welcome",
      "controls",
    ]);
  });
});

describe("spendSkillPoint", () => {
  it("unlocks the skill and spends the point", () => {
    const shop = new ShopDriver();
    shop.progression.skillPoints = 1;
    assert.ok(spendSkillPoint(shop.game, "fineShelving"));
    assert.ok(shop.progression.unlockedSkills.includes("fineShelving"));
    assert.strictEqual(shop.progression.skillPoints, 0);
  });

  it("refuses without a point", () => {
    const shop = new ShopDriver();
    assert.strictEqual(spendSkillPoint(shop.game, "fineShelving"), false);
    assert.ok(!shop.progression.unlockedSkills.includes("fineShelving"));
  });

  it("refuses when prerequisites are missing", () => {
    // boxJoinery requires fineShelving, which isn't unlocked yet.
    const shop = new ShopDriver();
    shop.progression.skillPoints = 5;
    assert.strictEqual(spendSkillPoint(shop.game, "boxJoinery"), false);
    assert.strictEqual(shop.progression.skillPoints, 5);
  });

  it("allows the chain once prerequisites are bought", () => {
    const shop = new ShopDriver();
    shop.progression.skillPoints = 2;
    assert.ok(spendSkillPoint(shop.game, "fineShelving"));
    assert.ok(spendSkillPoint(shop.game, "boxJoinery"));
    assert.ok(shop.progression.unlockedSkills.includes("boxJoinery"));
    assert.strictEqual(shop.progression.skillPoints, 0);
  });

  it("refuses to buy an already-owned starter skill", () => {
    const shop = new ShopDriver();
    shop.progression.skillPoints = 1;
    assert.strictEqual(spendSkillPoint(shop.game, STARTER_SKILLS[0]), false);
    assert.strictEqual(shop.progression.skillPoints, 1);
  });
});

describe("the learn driver verb", () => {
  it("spends the point through the command surface", () => {
    const shop = new ShopDriver();
    shop.progression.skillPoints = 1;
    shop.learn("fineShelving");
    assert.ok(shop.progression.unlockedSkills.includes("fineShelving"));
  });

  it("throws when the journal refuses", () => {
    const shop = new ShopDriver();
    assert.throws(() => shop.learn("fineShelving"), /Couldn't learn/);
  });
});
