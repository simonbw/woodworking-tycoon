import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "../board-helpers";
import {
  addConsumables,
  hasConsumables,
  NO_CONSUMABLES,
  subtractConsumables,
} from "../Consumable";
import { GameState } from "../GameState";
import { getMachines, MachineState } from "../Machine";
import { machineCanOperate } from "../machine-helpers";
import { getMaterialName, makeMaterial } from "../material-helpers";
import { getSellValue } from "../material-values";
import { FinishedProduct, Pallet } from "../Materials";
import { initialGameState } from "../initialGameState";
import { operateMachineAction } from "./player-actions";
import { buyConsumablePackAction } from "./store-actions";
import { tickAction } from "./tickAction";

/** The starter workspace sits at [1,2] rotation 0 — its operation cell. */
const WORKSPACE_OPERATION_CELL: [number, number] = [1, 3];

function stateWith(overrides: Partial<GameState>): GameState {
  return { ...initialGameState, ...overrides };
}

/** The starter workspace (hammer mounted) with per-test tweaks applied. */
function workspaceMachine(overrides: Partial<MachineState>): MachineState {
  return { ...initialGameState.machines[0], ...overrides };
}

/** Boards for one rustic shelf: 2 stringers and 3 deck boards. */
function shelfBoards() {
  return [
    board("pallet", 4, 6, 3),
    board("pallet", 4, 6, 3),
    board("pallet", 3, 4, 1),
    board("pallet", 3, 4, 1),
    board("pallet", 3, 4, 1),
  ];
}

/** A pallet with a single deck board left, so dismantling finishes it. */
function nearlyDismantledPallet(): Pallet {
  return makeMaterial<Pallet>({
    type: "pallet",
    deckBoards: [
      true,
      ...(Array(10).fill(false) as boolean[]),
    ] as Pallet["deckBoards"],
    stringerBoardsLeft: 3,
  });
}

function rawMapleBoard(): FinishedProduct {
  return makeMaterial<FinishedProduct>({
    type: "simpleCuttingBoard",
    species: "maple",
  });
}

describe("consumable stock helpers", () => {
  it("checks, adds, and subtracts amounts", () => {
    const stock = addConsumables(NO_CONSUMABLES, [
      { id: "nails", amount: 10 },
    ]);
    assert.strictEqual(stock.nails, 10);
    assert.ok(hasConsumables(stock, [{ id: "nails", amount: 10 }]));
    assert.ok(!hasConsumables(stock, [{ id: "nails", amount: 11 }]));
    assert.ok(!hasConsumables(stock, [{ id: "mineralOil", amount: 1 }]));
    const spent = subtractConsumables(stock, [{ id: "nails", amount: 4 }]);
    assert.strictEqual(spent.nails, 6);
  });
});

describe("buyConsumablePackAction", () => {
  it("deducts the pack price and adds the pack to shop stock", () => {
    const result = buyConsumablePackAction("nails")(stateWith({ money: 20 }));
    assert.strictEqual(result.money, 14);
    assert.strictEqual(result.consumables.nails, 50);
  });

  it("does nothing when the player cannot afford the pack", () => {
    const state = stateWith({ money: 2 });
    const result = buyConsumablePackAction("mineralOil")(state);
    assert.strictEqual(result, state);
  });
});

describe("salvaged nails", () => {
  it("dismantling a pallet returns one nail per board freed", () => {
    const machine = workspaceMachine({
      selectedOperationId: "dismantlePallet",
      processingMaterials: [nearlyDismantledPallet()],
      operationProgress: {
        status: "inProgress",
        phaseIndex: 0,
        ticksRemaining: 1,
      },
    });
    const state = stateWith({
      player: {
        ...initialGameState.player,
        position: WORKSPACE_OPERATION_CELL,
      },
      machines: [machine],
    });
    const result = tickAction(state);
    // Final pry-apart: 3 stringers + 1 deck board -> 4 nails
    assert.strictEqual(result.machines[0].outputMaterials.length, 4);
    assert.strictEqual(result.consumables.nails, 4);
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
      !machineCanOperate(getMachines(state.machines)[0], state.consumables),
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
      machineCanOperate(getMachines(state.machines)[0], state.consumables),
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
    // Maple simple cutting board: 40 x 3 = 120 raw, x1.25 oiled
    assert.strictEqual(getSellValue(output), 150);
    assert.strictEqual(getSellValue(rawMapleBoard()), 120);
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
      !machineCanOperate(getMachines(state.machines)[0], state.consumables),
    );
  });
});
