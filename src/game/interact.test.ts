import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "./board-helpers";
import { GameState, MaterialPile } from "./GameState";
import { getMachines, Machine, MachineState } from "./Machine";
import { initialGameState } from "./initialGameState";
import { interactLabel, resolveInteract } from "./interact";
import { Board } from "./Materials";
import { HAND_CAPACITY } from "./Person";

function pileAt(
  position: [number, number],
  length: Board["length"] = 12,
): MaterialPile {
  return { material: board("pine", length), position, rotation: 0 };
}

/** The starter garage, empty floor, player standing at [5, 5]. */
function shopWithPiles(...materialPiles: MaterialPile[]): GameState {
  return {
    ...initialGameState,
    machines: [],
    machineCrates: [],
    materialPiles,
    player: { ...initialGameState.player, position: [5, 5] },
  };
}

/**
 * The starter bench at [4, 4] with stock on its top, player standing at
 * its working position ([4, 6]) — where a real session finds them.
 */
function shopWithLoadedBench(...materialPiles: MaterialPile[]): GameState {
  const bench: MachineState = {
    machineTypeId: "workspace",
    position: [4, 4],
    rotation: 0,
    inputMaterials: [board("oak", 24)],
    processingMaterials: [],
    outputMaterials: [],
    selectedOperationId: "dismantlePallet",
    selectedParameters: undefined,
    operationProgress: {
      status: "notStarted",
      phaseIndex: 0,
      ticksRemaining: 0,
    },
    tools: [],
    storedMaterials: [],
  };
  return {
    ...initialGameState,
    machines: [bench],
    machineCrates: [],
    materialPiles,
    player: { ...initialGameState.player, position: [4, 6] },
  };
}

function theBench(gameState: GameState): Machine {
  return getMachines(gameState.machines)[0];
}

describe("resolveInteract", () => {
  it("names the piles underfoot newest-first, the top of the pile the one a plain press grabs", () => {
    // materialPiles keeps drop order, so `second` was set down on top of
    // `first` — and it's what E takes back, making drop-then-pickup a
    // round trip.
    const first = pileAt([5.5, 5.5]);
    const second = pileAt([5.5, 5.5]);
    const elsewhere = pileAt([8.5, 8.5]);
    const action = resolveInteract(
      shopWithPiles(first, second, elsewhere),
      undefined,
    );
    assert.strictEqual(action?.kind, "pick-up-floor");
    assert.deepStrictEqual(action.piles, [second, first]);
    assert.strictEqual(action.target, second);
  });

  it("steps the rummage offset through the pile and wraps it", () => {
    const bottom = pileAt([5.5, 5.5]);
    const middle = pileAt([5.5, 5.5]);
    const top = pileAt([5.5, 5.5]);
    const state = shopWithPiles(bottom, middle, top);
    const targetAt = (offset: number) => {
      const action = resolveInteract(state, undefined, offset);
      assert.strictEqual(action?.kind, "pick-up-floor");
      return action.target;
    };
    assert.strictEqual(targetAt(0), top);
    assert.strictEqual(targetAt(2), bottom);
    assert.strictEqual(targetAt(3), top);
    // Shift-R steps backwards from the top, wrapping to the bottom
    assert.strictEqual(targetAt(-1), bottom);
  });

  it("reaches long stock resting across the player's cell", () => {
    // An 8' board centered two cells away still lies across the player's
    // cell — the pile E grabs isn't necessarily centered underfoot.
    const overhanging = pileAt([5.5, 7.5], 96);
    const action = resolveInteract(shopWithPiles(overhanging), undefined);
    assert.strictEqual(action?.kind, "pick-up-floor");
    assert.strictEqual(action.piles[0], overhanging);
  });

  it("steps pickup aside when the hands are full", () => {
    // With the arms at capacity the chip never offers a pickup the
    // action would refuse
    const underfoot = pileAt([5.5, 5.5]);
    const state = shopWithPiles(underfoot);
    const fullHanded = {
      ...state,
      player: {
        ...state.player,
        inventory: Array.from({ length: HAND_CAPACITY }, () =>
          board("pine", 12),
        ),
      },
    };
    assert.strictEqual(resolveInteract(fullHanded, undefined), null);
  });

  it("offers nothing on a bare cell", () => {
    const action = resolveInteract(
      shopWithPiles(pileAt([8.5, 8.5])),
      undefined,
    );
    assert.strictEqual(action, null);
  });

  it("offers the bench's stock first, but rummages on to the floor", () => {
    // A loaded bench used to *hide* the board on the floor beside it —
    // E could only ever lift the bench's stock. The bench still goes
    // first, but R now steps the same ring onto the floor's pieces.
    const beside = pileAt([4.5, 6.5]);
    const state = shopWithLoadedBench(beside);
    const bench = theBench(state);

    const first = resolveInteract(state, bench, 0);
    assert.strictEqual(first?.kind, "take-inputs");

    const second = resolveInteract(state, bench, 1);
    assert.strictEqual(second?.kind, "pick-up-floor");
    assert.strictEqual(second.target, beside);
  });

  it("wraps the ring back to the bench, and backwards onto the floor", () => {
    const beside = pileAt([4.5, 6.5]);
    const state = shopWithLoadedBench(beside);
    const bench = theBench(state);

    // Two sources — bench stock, one pile — so offset 2 is home again
    assert.strictEqual(resolveInteract(state, bench, 2)?.kind, "take-inputs");
    // Shift-R from the top steps backwards onto the floor
    assert.strictEqual(
      resolveInteract(state, bench, -1)?.kind,
      "pick-up-floor",
    );
  });
});

describe("interactLabel", () => {
  it("names the piece the key moves, not the furniture it comes off", () => {
    // You can see which bench you're standing at; what you can't see is
    // which board is about to end up in your arms, so the chip says that.
    const pallet = { type: "pallet" } as never;
    assert.strictEqual(
      interactLabel({ kind: "truck-bed", count: 3, material: pallet }),
      "pick up Pallet",
    );
    assert.strictEqual(
      interactLabel({
        kind: "take-inputs",
        machine: {
          type: { name: "Makeshift Workbench" },
          inputMaterials: [pallet],
        } as never,
      }),
      "pick up Pallet",
    );
  });
});
