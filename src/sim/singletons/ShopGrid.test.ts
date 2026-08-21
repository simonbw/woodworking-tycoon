import assert from "node:assert";
import { describe, it } from "node:test";
import { BaseEntity } from "../../core/entity/BaseEntity";
import { on } from "../../core/entity/handler";
import { GameState } from "../../game/GameState";
import { initialGameState } from "../../game/initialGameState";
import { MachineState } from "../../game/Machine";
import { ShopDriver } from "../driver/ShopDriver";
import {
  pickUpMachine,
  putDownCarriedMachine,
} from "../commands/machine-commands";
import { ShopGrid } from "./ShopGrid";

/**
 * The live floor index: built from the entities, reused until a machine
 * event invalidates it, and consistent with the world the moment a
 * command returns (issue #230's command-then-read rule — synchronous
 * dispatch means the index a post-command read walks already reflects
 * the command).
 */

function workspaceMachine(): MachineState {
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
  };
}

function shopState(overrides: Partial<GameState> = {}): GameState {
  return { ...initialGameState, ...overrides };
}

describe("the shop grid", () => {
  it("indexes the loaded world's machines", () => {
    const shop = new ShopDriver({
      state: shopState({ machines: [workspaceMachine()] }),
    });
    const grid = shop.game.entities.getSingleton(ShopGrid);
    assert.strictEqual(
      grid.cellMap().at([1, 2])?.machine?.state.machineTypeId,
      "workspace",
    );
  });

  it("reuses the same index until something moves", () => {
    const shop = new ShopDriver({
      state: shopState({ machines: [workspaceMachine()] }),
    });
    const grid = shop.game.entities.getSingleton(ShopGrid);
    assert.strictEqual(grid.cellMap(), grid.cellMap());
  });

  it("reflects a hoisted machine the moment the command returns", () => {
    const shop = new ShopDriver({
      state: shopState({ machines: [workspaceMachine()] }),
    }).standAt([1, 4]);
    const grid = shop.game.entities.getSingleton(ShopGrid);
    const before = grid.cellMap();
    assert.ok(before.at([1, 2])?.machine);
    assert.ok(pickUpMachine(shop.game, shop.machine("workspace")));
    const after = grid.cellMap();
    assert.notStrictEqual(after, before);
    assert.strictEqual(after.at([1, 2])?.machine, undefined);
  });

  it("does not index a machine destroyed earlier in the same tick", () => {
    // In the real app commands run inside the engine tick, where a
    // destroyed entity stays listed until the tick ends — a rebuild in
    // that window must not index the ghost (the floor.spec pickup /
    // put-back-down regression).
    const shop = new ShopDriver({
      state: shopState({ machines: [workspaceMachine()] }),
    }).standAt([1, 4]);
    const grid = shop.game.entities.getSingleton(ShopGrid);
    let freeDuringTick: boolean | null = null;
    class InTickActor extends BaseEntity {
      @on("tick")
      onTick() {
        if (freeDuringTick !== null) return;
        assert.ok(pickUpMachine(shop.game, shop.machine("workspace")));
        freeDuringTick = grid.cellMap().at([1, 2])?.machine === undefined;
      }
    }
    shop.game.addEntity(new InTickActor());
    shop.tick();
    assert.strictEqual(freeDuringTick, true);
  });

  it("reflects a placed machine the moment the command returns", () => {
    const shop = new ShopDriver({
      state: shopState({
        machines: [],
        player: {
          ...initialGameState.player,
          carriedMachine: workspaceMachine(),
        },
      }),
    }).standAt([5, 5]);
    const grid = shop.game.entities.getSingleton(ShopGrid);
    assert.strictEqual(grid.cellMap().getFreeCells().length, 12 * 16);
    assert.ok(putDownCarriedMachine(shop.game));
    const placed = shop.machine("workspace");
    const map = grid.cellMap();
    assert.strictEqual(
      map.at(placed.state.position)?.machine?.state.machineTypeId,
      "workspace",
    );
  });
});
