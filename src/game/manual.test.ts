import assert from "node:assert";
import { describe, it } from "node:test";
import { GameState } from "./GameState";
import { initialGameState } from "./initialGameState";
import { makeToolItem } from "./material-helpers";
import { getArticle, ManualArticleId } from "./manual";

function unlocked(id: ManualArticleId, gameState: GameState): boolean {
  return getArticle(id).unlocked(gameState);
}

describe("manual article unlock conditions", () => {
  it("starts a fresh game with only the always-on articles", () => {
    assert.ok(unlocked("welcome", initialGameState));
    assert.ok(unlocked("controls", initialGameState));
    assert.ok(unlocked("lumber", initialGameState));
    for (const id of [
      "milling",
      "workbenches",
      "shop-layout",
      "dust",
      "skills",
    ] as const) {
      assert.ok(!unlocked(id, initialGameState), `${id} should be locked`);
    }
    assert.deepStrictEqual(initialGameState.progression.unlockedArticles, [
      "welcome",
      "controls",
      "lumber",
      "selling",
    ]);
  });

  it("ignores the starter hammer but counts a bought tool", () => {
    // The hammer is mounted on the workspace from minute one.
    assert.ok(!unlocked("workbenches", initialGameState));
    const withSander: GameState = {
      ...initialGameState,
      player: {
        ...initialGameState.player,
        inventory: [
          ...initialGameState.player.inventory,
          makeToolItem("sandingBlock"),
        ],
      },
    };
    assert.ok(unlocked("workbenches", withSander));
  });

  it("unlocks milling with the lumberyard or a milling machine", () => {
    assert.ok(
      unlocked("milling", { ...initialGameState, reputation: 12 }),
      "lumberyard reputation",
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

  it("unlocks workbenches on the bench's first extra gear", () => {
    assert.ok(
      unlocked("workbenches", {
        ...initialGameState,
        consumables: { ...initialGameState.consumables, mineralOil: 1 },
      }),
    );
    assert.ok(unlocked("workbenches", { ...initialGameState, clamps: 1 }));
    assert.ok(!unlocked("workbenches", initialGameState));
  });

  it("unlocks skills at the first skill point (level 2)", () => {
    const withXp = (xp: number): GameState => ({
      ...initialGameState,
      progression: { ...initialGameState.progression, xp },
    });
    assert.ok(!unlocked("skills", withXp(9)));
    assert.ok(unlocked("skills", withXp(10)));
  });
});

// The pass that writes these unlocks onto a running shop, and the manual's
// read-markers, are exercised against the live command surface in
// src/sim/systems/MilestoneSystem.test.ts.
