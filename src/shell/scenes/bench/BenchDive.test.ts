import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "../../../game/board-helpers";
import { GameState } from "../../../game/GameState";
import { initialGameState } from "../../../game/initialGameState";
import { MachineState } from "../../../game/Machine";
import { groupPieces } from "../../../game/bench-work/bench-group";
import { moveMaterialsToMachine } from "../../../sim/commands/machine-commands";
import { ShopDriver } from "../../../sim/driver/ShopDriver";
import { BenchDive } from "./BenchDive";

/**
 * The dive-owned stage cache (issue #230, phase 2): the run is derived
 * once and reused frame over frame, and a command's own commit drops it
 * before the command returns — so a post-commit read never sees a
 * claimed piece still lying on the pile (the freshness rule the old
 * per-call derivation protected). `stage()` itself needs a renderer, so
 * headless coverage reads `run()`.
 */

function workspaceMachine(
  overrides: Partial<MachineState> = {},
): MachineState {
  return {
    machineTypeId: "workspace",
    position: [1, 2],
    rotation: 0,
    inputMaterials: [],
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
    ...overrides,
  };
}

function benchShop(): { shop: ShopDriver; dive: BenchDive } {
  const state: GameState = {
    ...initialGameState,
    machines: [workspaceMachine()],
    player: {
      ...initialGameState.player,
      inventory: [board("maple", 24, 4, 2)],
    },
  };
  const shop = new ShopDriver({ state }).standAt([1, 4]);
  const dive = shop.game.addEntity(new BenchDive());
  return { shop, dive };
}

describe("the dive-owned bench run", () => {
  it("is null on the shop floor and live once a bench is open", () => {
    const { shop, dive } = benchShop();
    assert.strictEqual(dive.run(), null);
    dive.open(shop.machine("workspace"));
    assert.strictEqual(dive.run()?.opened.state.machineTypeId, "workspace");
  });

  it("reuses the same run until something on the bench moves", () => {
    const { shop, dive } = benchShop();
    dive.open(shop.machine("workspace"));
    assert.strictEqual(dive.run(), dive.run());
  });

  it("drops the run the moment a commit lands, before the next read", () => {
    const { shop, dive } = benchShop();
    dive.open(shop.machine("workspace"));
    const before = dive.run();
    assert.strictEqual(
      groupPieces(before!.group).length,
      0,
      "nothing staged yet",
    );
    assert.ok(
      moveMaterialsToMachine(
        shop.game,
        [shop.inventory[0]],
        shop.machine("workspace"),
      ),
    );
    const after = dive.run();
    assert.notStrictEqual(after, before);
    assert.strictEqual(groupPieces(after!.group).length, 1);
  });

  it("keeps the run through the roll-back after standing up", () => {
    const { shop, dive } = benchShop();
    dive.open(shop.machine("workspace"));
    dive.close();
    assert.strictEqual(dive.run()?.opened.state.machineTypeId, "workspace");
  });
});
