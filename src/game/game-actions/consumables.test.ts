import assert from "node:assert";
import { describe, it } from "node:test";
import { array } from "../../utils/arrayUtils";
import { board, palletBoard } from "../board-helpers";
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
import { FinishedProduct, Pallet } from "../Materials";
import { initialGameState } from "../initialGameState";
import { operateMachineAction } from "./player-actions";
import { buyConsumablePackAction } from "./store-actions";
import { pryPalletNailAction } from "./operation-actions";
import { initialPalletNails } from "../bench-work/pallet-geometry";
import { tickAction } from "./tickAction";

/** The starter workspace sits at [1,2] rotation 0 — its operation cell. */
const WORKSPACE_OPERATION_CELL: [number, number] = [1, 3];

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

/** A pallet with a single deck board left, so dismantling finishes it. */
function nearlyDismantledPallet(): Pallet {
  const deckBoards = [
    true,
    ...(Array(7).fill(false) as boolean[]),
  ] as Pallet["deckBoards"];
  return makeMaterial<Pallet>({
    type: "pallet",
    deckBoards,
    stringers: [true, true, true],
    nails: initialPalletNails(deckBoards, [true, true, true]),
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
    const stock = addConsumables(NO_CONSUMABLES, [{ id: "nails", amount: 10 }]);
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
  it("every pull banks a nail; boards drop with their last one", () => {
    // Dismantling is incremental: each pull is its own commit, the nail
    // clinks into the tin immediately, and a board comes free the moment
    // its last nail is out (see pryPalletNailAction).
    const machine = workspaceMachine({
      selectedOperationId: "dismantlePallet",
      inputMaterials: [nearlyDismantledPallet()],
    });
    let state = stateWith({
      player: {
        ...initialGameState.player,
        position: WORKSPACE_OPERATION_CELL,
      },
      machines: [machine],
    });
    // One deck board across three stringers: three nails hold all four
    // boards. Each of the first two pulls drops the stringer that just
    // lost its only nail; the third frees the deck board and the last
    // stringer together — every board lying on the bench (inputMaterials)
    const boardsOnBench = (s: typeof state) =>
      s.machines[0].inputMaterials.filter((m) => m.type === "board").length;
    for (const [pull, boards] of [
      [1, 1],
      [2, 2],
      [3, 4],
    ]) {
      state = pryPalletNailAction(getMachines(state.machines)[0])(state);
      assert.strictEqual(boardsOnBench(state), boards);
      assert.strictEqual(state.consumables.nails, pull);
    }
    // The pallet itself is gone with the last nail; its boards remain
    assert.strictEqual(state.machines[0].inputMaterials.length, 4);
    assert.strictEqual(state.machines[0].outputMaterials.length, 0);
    // Another pull finds nothing to pry and changes nothing
    const spent = pryPalletNailAction(getMachines(state.machines)[0])(state);
    assert.strictEqual(boardsOnBench(spent), 4);
    assert.strictEqual(spent.consumables.nails, 3);
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
