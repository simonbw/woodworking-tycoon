import assert from "node:assert";
import { describe, it } from "node:test";
import { GameState } from "../GameState";
import { initialGameState } from "../initialGameState";
import {
  generateScavengeLoot,
  SCAVENGE_DURATION_TICKS,
  startScavengingAction,
} from "./scavenge-actions";

/** rng stub cycling through the given values */
function fakeRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

function stateWithFreeSelling(): GameState {
  return {
    ...initialGameState,
    progression: { ...initialGameState.progression, freeSelling: true },
  };
}

describe("generateScavengeLoot", () => {
  it("yields one pallet on a low roll and two on a high roll", () => {
    assert.strictEqual(generateScavengeLoot(fakeRng([0.1])).length, 1);
    assert.strictEqual(generateScavengeLoot(fakeRng([0.9])).length, 2);
  });

  it("produces pallets with 6-11 deck boards and 2-3 stringers", () => {
    for (const roll of [0, 0.25, 0.5, 0.75, 0.999]) {
      const [pallet] = generateScavengeLoot(fakeRng([0.1, roll]));
      assert.strictEqual(pallet.type, "pallet");
      if (pallet.type === "pallet") {
        const deckCount = pallet.deckBoards.filter(Boolean).length;
        assert.ok(deckCount >= 6 && deckCount <= 11, `deck=${deckCount}`);
        assert.ok(
          pallet.stringerBoardsLeft >= 2 && pallet.stringerBoardsLeft <= 3,
        );
      }
    }
  });
});

describe("startScavengingAction", () => {
  it("sends the player away with pre-rolled loot", () => {
    const result = startScavengingAction(fakeRng([0.1]))(
      stateWithFreeSelling(),
    );
    assert.ok(result.player.away);
    assert.strictEqual(
      result.player.away?.returnTick,
      result.tick + SCAVENGE_DURATION_TICKS,
    );
    assert.strictEqual(result.player.away?.loot.length, 1);
    assert.strictEqual(result.player.canWork, false);
  });

  it("does nothing before free selling is unlocked", () => {
    const state = initialGameState;
    assert.strictEqual(startScavengingAction(fakeRng([0.1]))(state), state);
  });

  it("does nothing when the player is already away", () => {
    const awayState = startScavengingAction(fakeRng([0.1]))(
      stateWithFreeSelling(),
    );
    assert.strictEqual(
      startScavengingAction(fakeRng([0.1]))(awayState),
      awayState,
    );
  });
});
