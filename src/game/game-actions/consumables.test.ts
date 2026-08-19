import assert from "node:assert";
import { describe, it } from "node:test";
import { array } from "../../utils/arrayUtils";
import { palletBoard } from "../board-helpers";
import {
  addConsumables,
  hasConsumables,
  NO_CONSUMABLES,
  subtractConsumables,
} from "../Consumable";
import { GameState } from "../GameState";
import { getMachines, MachineState } from "../Machine";
import { machineCanOperate, shopSupply } from "../machine-helpers";
import { getMaterialName, makeMaterial } from "../material-helpers";
import { getSellValue } from "../material-values";
import { FinishedProduct } from "../Materials";
import { initialGameState } from "../initialGameState";
import { operateMachineAction } from "./player-actions";
import { tickAction } from "./tickAction";

function stateWith(overrides: Partial<GameState>): GameState {
  return { ...initialGameState, ...overrides };
}

/** The starter workspace (hammer mounted) with per-test tweaks applied. */
function workspaceMachine(overrides: Partial<MachineState>): MachineState {
  // The starter hammer stays (the shelf build is its op); the kit joins
  // it so the oiling suite's operations resolve
  return {
    ...initialGameState.machines[0],
    tools: ["hammer", "finishingKit"],
    ...overrides,
  };
}

/** Boards for one rustic shelf: six whole pallet boards. */
function shelfBoards() {
  return array(6).map(palletBoard);
}

function rawMapleBoard(): FinishedProduct {
  return makeMaterial<FinishedProduct>({
    type: "simpleCuttingBoard",
    species: "maple",
  });
}

describe("consumable stock helpers", () => {
  it("checks, adds, and subtracts amounts", () => {
    const stock = addConsumables(NO_CONSUMABLES, [{ id: "nails", amount: 10 }]);
    assert.strictEqual(stock.nails, 10);
    assert.ok(hasConsumables(stock, [{ id: "nails", amount: 10 }]));
    assert.ok(!hasConsumables(stock, [{ id: "nails", amount: 11 }]));
    assert.ok(!hasConsumables(stock, [{ id: "mineralOil", amount: 1 }]));
    const spent = subtractConsumables(stock, [{ id: "nails", amount: 4 }]);
    assert.strictEqual(spent.nails, 6);
  });
});

describe("operations that consume supplies", () => {
  it("refuses to start the rustic shelf without nails", () => {
    const machine = workspaceMachine({
      selectedOperationId: "buildRusticPalletShelf",
      inputMaterials: shelfBoards(),
    });
    const state = stateWith({ machines: [machine] });
    assert.ok(
      !machineCanOperate(getMachines(state.machines)[0], shopSupply(state)),
    );
    const result = operateMachineAction(getMachines(state.machines)[0])(state);
    assert.strictEqual(result, state);
  });

  it("spends the nails when the shelf build starts", () => {
    const machine = workspaceMachine({
      selectedOperationId: "buildRusticPalletShelf",
      inputMaterials: shelfBoards(),
    });
    const state = stateWith({
      machines: [machine],
      consumables: { ...NO_CONSUMABLES, nails: 10 },
    });
    assert.ok(
      machineCanOperate(getMachines(state.machines)[0], shopSupply(state)),
    );
    const result = operateMachineAction(getMachines(state.machines)[0])(state);
    assert.strictEqual(result.consumables.nails, 2);
    assert.strictEqual(
      result.machines[0].operationProgress.status,
      "inProgress",
    );
  });
});

describe("oiling cutting boards", () => {
  it("spends mineral oil when the wipe-down starts", () => {
    const machine = workspaceMachine({
      selectedOperationId: "oilCuttingBoard",
      inputMaterials: [rawMapleBoard()],
    });
    const state = stateWith({
      machines: [machine],
      consumables: { ...NO_CONSUMABLES, mineralOil: 16 },
    });
    const result = operateMachineAction(getMachines(state.machines)[0])(state);
    assert.strictEqual(result.consumables.mineralOil, 12);
  });

  it("produces an oiled board worth 25% more", () => {
    const machine = workspaceMachine({
      selectedOperationId: "oilCuttingBoard",
      processingMaterials: [rawMapleBoard()],
      // Mid-soak: the hands-free phase finishes this tick
      operationProgress: {
        status: "inProgress",
        phaseIndex: 1,
        ticksRemaining: 1,
      },
    });
    const result = tickAction(stateWith({ machines: [machine] }));
    const output = result.machines[0].outputMaterials[0] as FinishedProduct;
    assert.strictEqual(output.finish, "mineralOil");
    assert.ok(getMaterialName(output).startsWith("Oiled "));
    // Maple simple cutting board: 8 x 3 = 24 raw, x1.25 oiled
    assert.strictEqual(getSellValue(output), 30);
    assert.strictEqual(getSellValue(rawMapleBoard()), 24);
  });

  it("will not oil a board twice", () => {
    const oiledBoard = makeMaterial<FinishedProduct>({
      type: "simpleCuttingBoard",
      species: "maple",
      finish: "mineralOil",
    });
    const machine = workspaceMachine({
      selectedOperationId: "oilCuttingBoard",
      inputMaterials: [oiledBoard],
    });
    const state = stateWith({
      machines: [machine],
      consumables: { ...NO_CONSUMABLES, mineralOil: 16 },
    });
    assert.ok(
      !machineCanOperate(getMachines(state.machines)[0], shopSupply(state)),
    );
  });
});
