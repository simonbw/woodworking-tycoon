import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "../board-helpers";
import { CellMap } from "../CellMap";
import { GameState } from "../GameState";
import { getMachines, Machine, MachineState } from "../Machine";
import { initialGameState } from "../initialGameState";
import { resolveInteract } from "../interact";
import { machineCanOperate, stageableMaterials } from "../machine-helpers";
import { MaterialInstance } from "../Materials";
import {
  moveMaterialsToMachineAction,
  operateMachineAction,
  setOperatingAction,
  takeInputsFromMachineAction,
} from "../game-actions/player-actions";
import { tickAction } from "../game-actions/tickAction";
import { Vector, vectorKey } from "../Vectors";
import { GARBAGE_CAN_CAPACITY } from "./garbageCan";

/** A shop with one can in the middle of the floor, player beside it. */
function shopWithCan(
  contents: ReadonlyArray<MaterialInstance> = [],
): GameState {
  const can: MachineState = {
    machineTypeId: "garbageCan",
    position: [4, 4],
    rotation: 0,
    inputMaterials: [...contents],
    processingMaterials: [],
    outputMaterials: [],
    selectedOperationId: "empty",
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
    machines: [can],
    materialPiles: [],
    // Standing on the can's left, one of the twelve cells that reach it
    player: { ...initialGameState.player, position: [3, 4], inventory: [] },
  };
}

function theCan(gameState: GameState): Machine {
  return getMachines(gameState.machines)[0];
}

describe("garbage can", () => {
  it("is reached from every cell touching it, and none of its own", () => {
    const can = theCan(shopWithCan());
    const zone = new Set(can.operationZone.map(vectorKey));

    // The full ring around the 2×2 footprint at [4, 4]
    assert.strictEqual(zone.size, 12);
    for (const cell of [
      [3, 3],
      [4, 3],
      [5, 3],
      [6, 3],
      [3, 4],
      [6, 4],
      [3, 5],
      [6, 5],
      [3, 6],
      [4, 6],
      [5, 6],
      [6, 6],
    ] satisfies Vector[]) {
      assert.ok(zone.has(vectorKey(cell)), `expected to reach from ${cell}`);
    }
    for (const cell of can.occupiedCells) {
      assert.ok(!zone.has(vectorKey(cell)), `${cell} is the can itself`);
    }
  });

  it("stands in for a machine on all the cells around it", () => {
    const gameState = shopWithCan();
    const cellMap = CellMap.fromGameState(gameState);
    assert.strictEqual(cellMap.at([3, 4])?.operableMachines.length, 1);
    assert.strictEqual(cellMap.at([6, 6])?.operableMachines.length, 1);
    assert.strictEqual(cellMap.at([2, 4])?.operableMachines.length, 0);
  });

  it("takes anything the player is carrying", () => {
    const gameState = shopWithCan();
    const offcut = board("pine", 1, 3, 1);
    const panel = board("oak", 4, 6, 1, "sanded");
    const carried = [offcut, panel];

    assert.deepStrictEqual(
      stageableMaterials(theCan(gameState), carried, gameState.progression),
      carried,
    );
  });

  it("stops taking stock once it is full", () => {
    const full = shopWithCan(
      Array.from({ length: GARBAGE_CAN_CAPACITY }, () => board()),
    );
    assert.deepStrictEqual(
      stageableMaterials(theCan(full), [board()], full.progression),
      [],
    );
  });

  it("gives back what was tossed in — nothing is gone until it is emptied", () => {
    const offcut = board("pine", 2, 4, 1);
    let gameState: GameState = {
      ...shopWithCan(),
      player: { ...shopWithCan().player, inventory: [offcut] },
    };

    gameState = moveMaterialsToMachineAction(
      [offcut],
      theCan(gameState),
    )(gameState);
    assert.deepStrictEqual(gameState.player.inventory, []);
    assert.deepStrictEqual(theCan(gameState).inputMaterials, [offcut]);

    gameState = takeInputsFromMachineAction(
      [offcut],
      theCan(gameState),
    )(gameState);
    assert.deepStrictEqual(gameState.player.inventory, [offcut]);
    assert.deepStrictEqual(theCan(gameState).inputMaterials, []);
  });

  it("destroys one piece per run of Empty, leaving the rest", () => {
    const kept = board("oak", 3, 5, 1);
    let gameState = shopWithCan([board("pine", 1, 2, 1), kept]);

    gameState = operateMachineAction(theCan(gameState))(gameState);
    gameState = setOperatingAction(true)(gameState);
    assert.strictEqual(
      theCan(gameState).operationProgress.status,
      "inProgress",
    );

    let ticks = 0;
    for (let i = 0; i < 30; i++) {
      if (theCan(gameState).operationProgress.status !== "inProgress") break;
      gameState = tickAction(gameState);
      ticks++;
    }

    assert.strictEqual(
      theCan(gameState).operationProgress.status,
      "notStarted",
    );
    // Hauling a piece to the curb is a hold worth a second or more, not a
    // tap — a full can should feel like an errand.
    assert.ok(ticks >= 5, `emptying one piece took only ${ticks} ticks`);
    assert.deepStrictEqual(theCan(gameState).inputMaterials, [kept]);
    assert.deepStrictEqual(theCan(gameState).outputMaterials, []);
    assert.deepStrictEqual(gameState.player.inventory, []);
  });

  it("never answers the interact key — it is opened, not reached into", () => {
    const gameState = shopWithCan([board("pine", 1, 2, 1)]);
    assert.strictEqual(resolveInteract(gameState, theCan(gameState)), null);
    assert.strictEqual(resolveInteract(gameState, undefined), null);
  });

  it("leaves the floor to the interact key even while you face it", () => {
    // A can standing in twelve cells' reach must not take the key from a
    // board underfoot
    const gameState: GameState = {
      ...shopWithCan([board("pine", 1, 2, 1)]),
      materialPiles: [
        { material: board("oak", 2, 4, 1), position: [3, 4], rotation: 0 },
      ],
    };

    assert.deepStrictEqual(resolveInteract(gameState, theCan(gameState)), {
      kind: "pick-up-floor",
      piles: gameState.materialPiles,
    });
  });

  it("will not run when there is nothing in it", () => {
    const gameState = shopWithCan();
    const after = operateMachineAction(theCan(gameState))(gameState);
    assert.strictEqual(theCan(after).operationProgress.status, "notStarted");
  });

  it("reports whether it can run without choking on its take-anything recipe", () => {
    // Empty's requirement names no material type, which the slot matcher
    // has to be able to build a placeholder for — every hint chip and
    // sheet on screen asks this question about the can underfoot.
    assert.strictEqual(machineCanOperate(theCan(shopWithCan())), false);
    assert.strictEqual(
      machineCanOperate(theCan(shopWithCan([board("pine", 1, 2, 1)]))),
      true,
    );
  });
});
