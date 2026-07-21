import assert from "node:assert";
import { describe, it } from "node:test";
import {
  checkProgressionMilestonesAction,
  markArticlesReadAction,
} from "./game-actions/progression-actions";
import { GameState } from "./GameState";
import { initialGameState } from "./initialGameState";
import { getArticle, ManualArticleId } from "./manual";
import { migrateV18toV19 } from "./saveLoad";

function unlocked(id: ManualArticleId, gameState: GameState): boolean {
  return getArticle(id).unlocked(gameState);
}

describe("manual article unlock conditions", () => {
  it("starts a fresh game with only the always-on articles", () => {
    assert.ok(unlocked("welcome", initialGameState));
    assert.ok(unlocked("controls", initialGameState));
    for (const id of [
      "milling",
      "finishing",
      "tools",
      "shop-layout",
      "dust",
      "marketplace",
      "skills",
    ] as const) {
      assert.ok(!unlocked(id, initialGameState), `${id} should be locked`);
    }
    assert.deepStrictEqual(initialGameState.progression.unlockedArticles, [
      "welcome",
      "controls",
    ]);
  });

  it("ignores the starter hammer but counts a bought tool", () => {
    // The hammer is mounted on the workspace from minute one.
    assert.ok(!unlocked("tools", initialGameState));
    const withSander: GameState = {
      ...initialGameState,
      storage: { ...initialGameState.storage, tools: ["sandingBlock"] },
    };
    assert.ok(unlocked("tools", withSander));
  });

  it("unlocks milling with a non-S4S lumber channel or a milling machine", () => {
    assert.ok(
      unlocked("milling", { ...initialGameState, reputation: 12 }),
      "lumberyard S2S reputation",
    );
    assert.ok(!unlocked("milling", { ...initialGameState, reputation: 11 }));
    const withJointer: GameState = {
      ...initialGameState,
      machineCrates: [
        {
          machine: {
            ...initialGameState.machines[0],
            machineTypeId: "jointer",
          },
          position: [0, 0],
        },
      ],
    };
    assert.ok(unlocked("milling", withJointer));
  });

  it("unlocks finishing on owning finish or reaching the cutting-board commission", () => {
    assert.ok(
      unlocked("finishing", {
        ...initialGameState,
        consumables: { ...initialGameState.consumables, mineralOil: 1 },
      }),
    );
    assert.ok(
      unlocked("finishing", {
        ...initialGameState,
        progression: {
          ...initialGameState.progression,
          commissionsCompleted: 5,
        },
      }),
    );
    assert.ok(!unlocked("finishing", initialGameState));
  });

  it("unlocks skills at the first skill point (level 2)", () => {
    const withXp = (xp: number): GameState => ({
      ...initialGameState,
      progression: { ...initialGameState.progression, xp },
    });
    assert.ok(!unlocked("skills", withXp(149)));
    assert.ok(unlocked("skills", withXp(150)));
  });
});

describe("checkProgressionMilestonesAction manual unlocks", () => {
  it("records newly met articles and keeps them one-way", () => {
    const withOil: GameState = {
      ...initialGameState,
      consumables: { ...initialGameState.consumables, mineralOil: 16 },
    };
    const after = checkProgressionMilestonesAction()(withOil);
    assert.ok(after.progression.unlockedArticles.includes("finishing"));

    // Condition gone (oil used up), unlock stays.
    const oilGone = checkProgressionMilestonesAction()({
      ...after,
      consumables: { ...after.consumables, mineralOil: 0 },
    });
    assert.ok(oilGone.progression.unlockedArticles.includes("finishing"));
  });

  it("never duplicates an already-unlocked article", () => {
    const once = checkProgressionMilestonesAction()(initialGameState);
    const twice = checkProgressionMilestonesAction()(once);
    const ids = twice.progression.unlockedArticles;
    assert.strictEqual(new Set(ids).size, ids.length);
  });

  it("unlocks an article gated on a flag flipped in the same pass", () => {
    // Enough floor dust flips sweepingUnlocked, whose article must not lag
    // a pass behind.
    const dusty: GameState = {
      ...initialGameState,
      dust: { "1,1": { pine: 80 } },
    };
    const after = checkProgressionMilestonesAction()(dusty);
    assert.ok(after.progression.sweepingUnlocked);
    assert.ok(after.progression.unlockedArticles.includes("dust"));
  });
});

describe("markArticlesReadAction", () => {
  it("appends only unread articles and no-ops when nothing is new", () => {
    const once = markArticlesReadAction(["welcome"])(initialGameState);
    assert.deepStrictEqual(once.progression.readArticles, ["welcome"]);

    const again = markArticlesReadAction(["welcome"])(once);
    assert.strictEqual(again, once);

    const both = markArticlesReadAction(["welcome", "controls"])(once);
    assert.deepStrictEqual(both.progression.readArticles, [
      "welcome",
      "controls",
    ]);
  });
});

describe("migrateV18toV19", () => {
  it("unlocks everything the save already earned, pre-read", () => {
    const veteran = {
      ...initialGameState,
      reputation: 22,
      consumables: { nails: 10, mineralOil: 8 },
      progression: {
        ...initialGameState.progression,
        marketplaceUnlocked: true,
        shopLayoutUnlocked: true,
        sweepingUnlocked: true,
        commissionsCompleted: 7,
        xp: 900,
      },
    };
    const migrated = migrateV18toV19(veteran);
    const { unlockedArticles, readArticles } = migrated.progression;
    // A shop this far along has earned the whole binder…
    assert.deepStrictEqual([...unlockedArticles].sort(), [
      "controls",
      "dust",
      "finishing",
      "marketplace",
      "milling",
      "shop-layout",
      "skills",
      "welcome",
    ]);
    // …with nothing badged NEW: welcome included, so no auto-open either.
    assert.deepStrictEqual(readArticles, unlockedArticles);
  });

  it("gives an early save only the basics, still pre-read", () => {
    const migrated = migrateV18toV19({ ...initialGameState });
    assert.deepStrictEqual(migrated.progression.unlockedArticles, [
      "welcome",
      "controls",
    ]);
    assert.deepStrictEqual(migrated.progression.readArticles, [
      "welcome",
      "controls",
    ]);
  });
});
