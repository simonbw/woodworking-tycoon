import assert from "node:assert";
import { describe, it } from "node:test";
import { array } from "../../utils/arrayUtils";
import { board, palletBoard } from "../../game/board-helpers";
import { NO_CONSUMABLES } from "../../game/Consumable";
import { GameState } from "../../game/GameState";
import { initialGameState } from "../../game/initialGameState";
import { MachineState } from "../../game/Machine";
import { GLUE_CURE_TICKS } from "../../game/machines/workspace";
import { GARBAGE_CAN_CAPACITY } from "../../game/machines/garbageCan";
import { makeMaterial } from "../../game/material-helpers";
import { MaterialInstance, SheetGood } from "../../game/Materials";
import { SkillId } from "../../game/Skill";
import { Vector } from "../../game/Vectors";
import { ShopDriver } from "../driver/ShopDriver";
import {
  finishAttendedWork,
  freshMachineState,
  moveMaterialsToMachine,
  operateMachine,
  pickUpMachine,
  stowMaterialsInMachine,
  takeInputsFromMachine,
  takeStoredMaterialsFromMachine,
} from "./machine-commands";

/**
 * The machine commands' contract — `operateMachine`,
 * `finishAttendedWork`, and the material moves that feed them: starting
 * a job claims exactly the stock it needs and spends what it costs, hand
 * work finishes through the bench view's commit, and each refusal — no
 * clamps free, no clear run, a piece the tool won't take, hand work from
 * across the shop — turns the job down quietly.
 *
 * The clock's half of the same system (countdowns, dust, tick-driven
 * completions) is `systems/MachineSystem.test.ts`.
 */

/** The bench at [1,2] rotation 0 — its operation cell lands at [1,4]. */
const OPERATION_CELL: Vector = [1, 4];

const ACROSS_THE_SHOP: Vector = [8, 8];

function shopState(overrides: Partial<GameState> = {}): GameState {
  return { ...initialGameState, ...overrides };
}

function workspaceMachine(
  overrides: Partial<MachineState> = {},
  position: Vector = [1, 2],
): MachineState {
  return {
    machineTypeId: "workspace",
    position,
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

function machineAt(
  machineTypeId: MachineState["machineTypeId"],
  position: Vector,
  overrides: Partial<MachineState> = {},
): MachineState {
  return {
    ...freshMachineState(machineTypeId, initialGameState.progression),
    position,
    ...overrides,
  };
}

/** A shop holding these machines, the player at the bench's post. */
function benchShop(
  machines: ReadonlyArray<MachineState>,
  overrides: Partial<GameState> = {},
  skills: ReadonlyArray<SkillId> = [],
): ShopDriver {
  const shop = new ShopDriver({
    state: shopState({
      machines: [...machines],
      progression: {
        ...initialGameState.progression,
        unlockedSkills: [
          ...initialGameState.progression.unlockedSkills,
          ...skills,
        ],
      },
      ...overrides,
    }),
  });
  return shop.standAt(OPERATION_CELL);
}

const smoothMaple = () => board("maple", 24, 2, 4, "smooth");
const roughBoard = () => board("maple", 24, 4, 4, "rough");

describe("starting and finishing hand work", () => {
  it("resolves a started sanding pass: outputs, sound, and an idle bench", () => {
    const shop = benchShop(
      [
        workspaceMachine({
          tools: ["sandingBlock"],
          selectedOperationId: "blockSandBoard",
          inputMaterials: [roughBoard()],
        }),
      ],
      {},
      ["surfacePrep"],
    );
    const bench = shop.machine("workspace");

    // The first stroke starts the operation (claiming the board) —
    assert.ok(operateMachine(shop.game, bench));
    assert.strictEqual(bench.state.operationProgress.status, "inProgress");
    // — and no amount of held Space moves it: the clock skips interactive
    // attended work outright.
    const started = bench.state;
    shop.holdOperate(true).tick();
    assert.strictEqual(bench.state, started);

    // Coverage crossed the threshold: the bench view commits.
    assert.ok(finishAttendedWork(shop.game, bench));
    assert.strictEqual(bench.state.outputMaterials.length, 1);
    const output = bench.state.outputMaterials[0];
    assert.ok(output.type === "board" && output.surface === "smooth");
    assert.strictEqual(bench.state.operationProgress.status, "notStarted");
  });

  it("refuses from across the shop — hand work needs hands", () => {
    const shop = benchShop(
      [
        workspaceMachine({
          tools: ["sandingBlock"],
          selectedOperationId: "blockSandBoard",
          processingMaterials: [roughBoard()],
          operationProgress: {
            status: "inProgress",
            phaseIndex: 0,
            ticksRemaining: 40,
          },
        }),
      ],
      {},
      ["surfacePrep"],
    );
    shop.standAt(ACROSS_THE_SHOP);
    const bench = shop.machine("workspace");
    const before = bench.state;
    assert.strictEqual(finishAttendedWork(shop.game, bench), false);
    assert.strictEqual(bench.state, before);
  });

  it("refuses to finish a legacy (non-interactive) operation", () => {
    const shop = benchShop([
      workspaceMachine({
        selectedOperationId: "finishCuttingBoard",
        operationProgress: {
          status: "inProgress",
          phaseIndex: 0,
          ticksRemaining: 5,
        },
      }),
    ]);
    const bench = shop.machine("workspace");
    const before = bench.state;
    assert.strictEqual(finishAttendedWork(shop.game, bench), false);
    assert.strictEqual(bench.state, before);
  });

  it("hands a glue-up to the cure: the last clamp starts the clock, not the panel", () => {
    const shop = benchShop(
      [
        workspaceMachine({
          selectedOperationId: "glueUpPanel",
          inputMaterials: array(5).map(smoothMaple),
        }),
      ],
      { clamps: 4 },
      ["panelWork"],
    );
    const bench = shop.machine("workspace");

    // The single commit: start (ties up clamps) + finish (into the cure)
    assert.ok(operateMachine(shop.game, bench));
    assert.ok(finishAttendedWork(shop.game, bench));
    assert.deepStrictEqual(bench.state.operationProgress, {
      status: "inProgress",
      phaseIndex: 1,
      ticksRemaining: GLUE_CURE_TICKS,
    });
    // No panel yet — the glue has to cure
    assert.strictEqual(bench.state.outputMaterials.length, 0);

    // The cure runs hands-free; nobody needs to stand there
    shop.standAt(ACROSS_THE_SHOP).tick(GLUE_CURE_TICKS);
    assert.strictEqual(bench.state.outputMaterials.length, 1);
    assert.strictEqual(bench.state.outputMaterials[0].type, "panel");
  });

  it("assembly's paired commit spends the fasteners and yields the build", () => {
    const shelfBoards = array(6).map(palletBoard);
    const shop = benchShop(
      [
        workspaceMachine({
          tools: ["hammer"],
          selectedOperationId: "buildRusticPalletShelf",
          inputMaterials: shelfBoards,
        }),
      ],
      { consumables: { ...NO_CONSUMABLES, nails: 10 } },
      ["rusticCarpentry"],
    );
    const bench = shop.machine("workspace");

    assert.ok(operateMachine(shop.game, bench));
    assert.strictEqual(shop.consumables.stock.nails, 2);
    assert.ok(finishAttendedWork(shop.game, bench));
    assert.strictEqual(bench.state.outputMaterials.length, 1);
    const product = bench.state.outputMaterials[0];
    assert.strictEqual(product.type, "rusticShelf");
    // The bill of materials rides the product: the very boards that went
    // in, their ids as grain seeds (see bench-work/blueprint.ts)
    assert.strictEqual(
      (product as { parts?: readonly { seed: string }[] }).parts?.length,
      6,
    );
    assert.strictEqual(
      (product as { parts: readonly { seed: string }[] }).parts[0].seed,
      shelfBoards[0].id,
    );
    // Craft XP for the finished product, exactly as a tick completion pays
    assert.ok(shop.progression.xp > 0);
  });
});

describe("tool-first claims (operateMachine with a bench tool claim)", () => {
  it("claims exactly the piece under the tool, never the first match", () => {
    const first = roughBoard();
    const second = roughBoard();
    const shop = benchShop([
      workspaceMachine({
        tools: ["sandingBlock"],
        selectedOperationId: undefined,
        inputMaterials: [first, second],
      }),
    ]);
    const bench = shop.machine("workspace");
    assert.ok(
      operateMachine(shop.game, bench, {
        operationId: "blockSandBoard",
        materialId: second.id,
      }),
    );
    assert.strictEqual(bench.state.processingMaterials[0].id, second.id);
    assert.deepStrictEqual(
      bench.state.inputMaterials.map((m) => m.id),
      [first.id],
    );
    assert.strictEqual(bench.state.selectedOperationId, "blockSandBoard");
    assert.strictEqual(bench.state.operationProgress.status, "inProgress");
  });

  it("works a piece lying in the output bay too — rework needs no restaging", () => {
    const offcut = roughBoard();
    const shop = benchShop([
      workspaceMachine({
        tools: ["sandingBlock"],
        selectedOperationId: undefined,
        outputMaterials: [offcut],
      }),
    ]);
    const bench = shop.machine("workspace");
    assert.ok(
      operateMachine(shop.game, bench, {
        operationId: "blockSandBoard",
        materialId: offcut.id,
      }),
    );
    assert.strictEqual(bench.state.processingMaterials[0].id, offcut.id);
    assert.deepStrictEqual(bench.state.outputMaterials, []);
  });

  it("records the mark's parameters so completion cuts where it was marked", () => {
    const stock = board("pine", 48, 4, 4);
    const shop = benchShop([
      workspaceMachine({
        tools: ["handSaw"],
        selectedOperationId: undefined,
        inputMaterials: [stock],
      }),
    ]);
    const bench = shop.machine("workspace");
    assert.ok(
      operateMachine(shop.game, bench, {
        operationId: "handSawCut",
        materialId: stock.id,
        parameters: { targetLength: 18, cutEnd: "right", angle: 0 },
      }),
    );
    assert.strictEqual(bench.state.selectedOperationId, "handSawCut");
    assert.strictEqual(bench.state.selectedParameters?.targetLength, 18);

    assert.ok(finishAttendedWork(shop.game, bench));
    const lengths = bench.state.outputMaterials.map((m) =>
      m.type === "board" ? m.length : 0,
    );
    assert.deepStrictEqual(
      lengths.sort((a, b) => a - b),
      [18, 30],
    );
  });

  it("refuses a piece the operation doesn't take", () => {
    const doneBoard = board("maple", 24, 4, 4, "sanded");
    const shop = benchShop([
      workspaceMachine({
        tools: ["sandingBlock"],
        selectedOperationId: undefined,
        inputMaterials: [doneBoard],
      }),
    ]);
    const bench = shop.machine("workspace");
    assert.strictEqual(
      operateMachine(shop.game, bench, {
        operationId: "blockSandBoard",
        materialId: doneBoard.id,
      }),
      false,
    );
    assert.strictEqual(bench.state.operationProgress.status, "notStarted");
  });
});

describe("finished tool work lies where the workpiece lay", () => {
  it("a sanded board keeps its exact spot — nothing moves at the commit", () => {
    const stock = roughBoard();
    const seat = { xIn: 10, yIn: 20, angleDeg: 97, flipped: false };
    const shop = benchShop([
      workspaceMachine({
        tools: ["sandingBlock"],
        selectedOperationId: undefined,
        inputMaterials: [stock],
        benchLayout: { [stock.id]: seat },
      }),
    ]);
    const bench = shop.machine("workspace");
    assert.ok(
      operateMachine(shop.game, bench, {
        operationId: "blockSandBoard",
        materialId: stock.id,
      }),
    );
    assert.ok(finishAttendedWork(shop.game, bench));
    const output = bench.state.outputMaterials[0];
    assert.deepStrictEqual(bench.state.benchLayout?.[output.id], seat);
    assert.strictEqual(bench.state.benchLayout?.[stock.id], undefined);
  });

  it("a cut parts into two pieces lying end to end at the mark", () => {
    const stock = board("pine", 48, 4, 4);
    const seat = { xIn: 24, yIn: 18, angleDeg: 0, flipped: false };
    const shop = benchShop([
      workspaceMachine({
        tools: ["handSaw"],
        selectedOperationId: undefined,
        inputMaterials: [stock],
        benchLayout: { [stock.id]: seat },
      }),
    ]);
    const bench = shop.machine("workspace");
    assert.ok(
      operateMachine(shop.game, bench, {
        operationId: "handSawCut",
        materialId: stock.id,
        parameters: { targetLength: 18, cutEnd: "right", angle: 0 },
      }),
    );
    assert.ok(finishAttendedWork(shop.game, bench));
    const [kept, offcut] = bench.state.outputMaterials;
    assert.ok(kept.type === "board" && kept.length === 18);
    assert.ok(offcut.type === "board" && offcut.length === 30);
    // Kept: center 9" down from the top end that sat at yIn 18 - 24 = -6
    assert.deepStrictEqual(bench.state.benchLayout?.[kept.id], {
      ...seat,
      yIn: 18 + (18 / 2 - 24),
    });
    // Offcut: the remaining stretch below the mark
    assert.deepStrictEqual(bench.state.benchLayout?.[offcut.id], {
      ...seat,
      yIn: 18 + (18 + 30 / 2 - 24),
    });
  });

  it("a turned board's pieces part along its turned length axis", () => {
    const stock = board("pine", 48, 4, 4);
    const seat = { xIn: 24, yIn: 18, angleDeg: 90, flipped: false };
    const shop = benchShop([
      workspaceMachine({
        tools: ["handSaw"],
        selectedOperationId: undefined,
        inputMaterials: [stock],
        benchLayout: { [stock.id]: seat },
      }),
    ]);
    const bench = shop.machine("workspace");
    assert.ok(
      operateMachine(shop.game, bench, {
        operationId: "handSawCut",
        materialId: stock.id,
        parameters: { targetLength: 18, cutEnd: "right", angle: 0 },
      }),
    );
    assert.ok(finishAttendedWork(shop.game, bench));
    const [kept] = bench.state.outputMaterials;
    const placement = bench.state.benchLayout?.[kept.id];
    // At 90° the length axis runs along -x: offset -15 lands at x 39
    assert.ok(placement);
    assert.ok(Math.abs(placement.xIn - 39) < 1e-9);
    assert.ok(Math.abs(placement.yIn - 18) < 1e-9);
  });
});

describe("the clamp rack gates what can start", () => {
  it("refuses a glue-up when the other bench is holding the clamps", () => {
    // Three clamps owned, two already curing a panel on the far bench:
    // not enough left for a second two-clamp glue-up.
    const curing = workspaceMachine(
      {
        selectedOperationId: "glueUpPanel",
        processingMaterials: array(5).map(smoothMaple),
        operationProgress: {
          status: "inProgress",
          phaseIndex: 0,
          ticksRemaining: 4,
        },
      },
      [6, 8],
    );
    const waiting = workspaceMachine({
      selectedOperationId: "glueUpPanel",
      inputMaterials: array(5).map(smoothMaple),
    });
    const shop = benchShop([waiting, curing], { clamps: 3 }, ["panelWork"]);
    const bench = shop.machineAt("workspace", [1, 2]);
    assert.strictEqual(operateMachine(shop.game, bench), false);
    assert.strictEqual(bench.state.operationProgress.status, "notStarted");
  });
});

describe("feed clearance gates what can start", () => {
  /** An 8-footer ready to rip: one straight edge to ride the fence. */
  const longBoard = () =>
    board("walnut", 96, 6, 4, "rough", { faces: 1, edges: 1 });

  const stagedSaw = (position: Vector) =>
    machineAt("jobsiteTableSaw", position, {
      inputMaterials: [longBoard()],
      poweredOn: true,
    });

  it("keeps a cut from starting without room to run the stock", () => {
    // One cell toward the operator's wall leaves 6' of infeed where an
    // 8' rip needs 7'
    const cramped = benchShop([stagedSaw([6, 9])], {}, ["basicMilling"]);
    const saw = cramped.machine("jobsiteTableSaw");
    assert.strictEqual(operateMachine(cramped.game, saw), false);
    assert.strictEqual(saw.state.operationProgress.status, "notStarted");
    assert.strictEqual(cramped.canOperate("jobsiteTableSaw"), false);

    const roomy = benchShop([stagedSaw([6, 8])], {}, ["basicMilling"]);
    assert.ok(roomy.canOperate("jobsiteTableSaw"));
    assert.ok(operateMachine(roomy.game, roomy.machine("jobsiteTableSaw")));
    assert.strictEqual(
      roomy.machine("jobsiteTableSaw").state.operationProgress.status,
      "inProgress",
    );
  });
});

describe("the garbage can", () => {
  /** A shop with one can in the middle of the floor, player beside it. */
  function canShop(
    contents: ReadonlyArray<MaterialInstance> = [],
    carried: ReadonlyArray<MaterialInstance> = [],
  ): ShopDriver {
    const shop = new ShopDriver({
      state: shopState({
        machines: [
          machineAt("garbageCan", [4, 4], {
            inputMaterials: [...contents],
            selectedOperationId: "empty",
          }),
        ],
        player: {
          ...initialGameState.player,
          position: [3, 4],
          inventory: [...carried],
        },
      }),
    });
    // Standing on the can's left, one of the twelve cells that reach it
    return shop.standAt([3, 4]);
  }

  it("gives back what was tossed in — nothing is gone until it is emptied", () => {
    const offcut = board("pine", 24, 4, 1);
    const shop = canShop([], [offcut]);
    const can = shop.machine("garbageCan");

    assert.ok(moveMaterialsToMachine(shop.game, [offcut], can));
    assert.deepStrictEqual(shop.inventory, []);
    assert.deepStrictEqual(can.state.inputMaterials, [offcut]);

    assert.ok(takeInputsFromMachine(shop.game, [offcut], can));
    assert.deepStrictEqual(shop.inventory, [offcut]);
    assert.deepStrictEqual(can.state.inputMaterials, []);
  });

  it("takes stock until it is full", () => {
    const full = canShop(
      array(GARBAGE_CAN_CAPACITY).map(() => board()),
      [board()],
    );
    const can = full.machine("garbageCan");
    assert.strictEqual(
      moveMaterialsToMachine(full.game, [...full.inventory], can),
      false,
    );
    assert.strictEqual(can.state.inputMaterials.length, GARBAGE_CAN_CAPACITY);
  });

  it("destroys one piece per run of Empty, leaving the rest", () => {
    const kept = board("oak", 36, 5, 1);
    const shop = canShop([board("pine", 12, 2, 1), kept]);
    const can = shop.machine("garbageCan");

    assert.ok(operateMachine(shop.game, can));
    shop.holdOperate(true);
    assert.strictEqual(can.state.operationProgress.status, "inProgress");

    let ticks = 0;
    for (let i = 0; i < 30; i++) {
      if (can.state.operationProgress.status !== "inProgress") break;
      shop.tick();
      ticks++;
    }

    assert.strictEqual(can.state.operationProgress.status, "notStarted");
    // Hauling a piece to the curb is a hold worth a second or more, not a
    // tap — a full can should feel like an errand.
    assert.ok(ticks >= 5, `emptying one piece took only ${ticks} ticks`);
    assert.deepStrictEqual(can.state.inputMaterials, [kept]);
    assert.deepStrictEqual(can.state.outputMaterials, []);
    assert.deepStrictEqual(shop.inventory, []);
  });

  it("will not run when there is nothing in it", () => {
    const shop = canShop();
    const can = shop.machine("garbageCan");
    assert.strictEqual(operateMachine(shop.game, can), false);
    assert.strictEqual(can.state.operationProgress.status, "notStarted");
  });
});

describe("a station's shelf", () => {
  it("stows carried materials up to capacity and takes them back", () => {
    const stock = array(4).map(() => board("maple", 24, 2, 4));
    const shop = new ShopDriver({
      state: shopState({
        machines: [machineAt("worktable1x1", [2, 2])],
        player: { ...initialGameState.player, inventory: stock },
      }),
    });
    const table = shop.machine("worktable1x1");

    // worktable1x1 holds 3 — stowing all 4 is refused outright
    assert.strictEqual(stowMaterialsInMachine(shop.game, stock, table), false);
    assert.strictEqual(shop.inventory.length, 4);

    assert.ok(stowMaterialsInMachine(shop.game, stock.slice(0, 3), table));
    assert.strictEqual(table.state.storedMaterials?.length, 3);
    assert.strictEqual(shop.inventory.length, 1);

    assert.ok(
      takeStoredMaterialsFromMachine(
        shop.game,
        [table.state.storedMaterials![0]],
        table,
      ),
    );
    assert.strictEqual(table.state.storedMaterials?.length, 2);
    assert.strictEqual(shop.inventory.length, 2);
  });
});

describe("carrying a worktable", () => {
  it("refuses to pick up a table with a machine mounted on it", () => {
    const shop = new ShopDriver({
      state: shopState({
        machines: [
          machineAt("worktable1x2", [0, 0]),
          machineAt("miterSaw", [1, 1]),
        ],
      }),
    });
    const table = shop.machine("worktable1x2");
    assert.strictEqual(pickUpMachine(shop.game, table), false);
    assert.strictEqual(shop.player.carriedMachine, null);
    assert.ok(!table.isDestroyed);
  });

  it("keeps shelf stock aboard when a table is carried", () => {
    const shop = new ShopDriver({
      state: shopState({
        machines: [
          machineAt("worktable1x1", [2, 2], {
            storedMaterials: [board("maple", 24, 2, 4)],
          }),
        ],
      }),
    });
    assert.ok(pickUpMachine(shop.game, shop.machine("worktable1x1")));
    assert.strictEqual(shop.player.carriedMachine?.storedMaterials?.length, 1);
    assert.strictEqual(shop.piles.length, 0);
    assert.strictEqual(shop.shop.machines.length, 0);
  });
});

describe("what a finished build delivers", () => {
  function plywood(length: number, width: number): SheetGood {
    return makeMaterial<SheetGood>({
      type: "plywood",
      kind: "plywoodB",
      length,
      width,
      thickness: 2,
    });
  }

  it("lands a shop-built worktable crated at the bench's operator cell", () => {
    const shop = benchShop([
      workspaceMachine({
        selectedOperationId: "build-worktable1x1",
        processingMaterials: [
          plywood(48, 48),
          board("pallet", 48, 6, 6),
          board("pallet", 48, 6, 6),
          board("pallet", 48, 6, 6),
        ],
        operationProgress: {
          status: "inProgress",
          phaseIndex: 0,
          ticksRemaining: 1,
        },
      }),
    ]);
    const bench = shop.machine("workspace");
    assert.ok(finishAttendedWork(shop.game, bench));

    const crates = shop.shop.machineCrates;
    assert.strictEqual(crates.length, 1);
    assert.strictEqual(crates[0].machine.machineTypeId, "worktable1x1");
    assert.deepStrictEqual(crates[0].position, OPERATION_CELL);
    assert.strictEqual(bench.state.operationProgress.status, "notStarted");
  });

  it("pays no craft XP for shop-built tooling", () => {
    // The sled takes a piece off a sheet, not a whole sheet. Where it
    // lands is the end-grain chain's business; what it's worth is here.
    const shop = benchShop([
      workspaceMachine({
        selectedOperationId: "buildCrosscutSled",
        processingMaterials: [plywood(24, 20), palletBoard(), palletBoard()],
        operationProgress: {
          status: "inProgress",
          phaseIndex: 0,
          ticksRemaining: 1,
        },
      }),
    ]);
    const bench = shop.machine("workspace");
    assert.ok(finishAttendedWork(shop.game, bench));

    const outputs = bench.state.outputMaterials;
    assert.strictEqual(outputs.length, 1);
    const sled = outputs[0];
    assert.ok(sled.type === "tool" && sled.toolId === "crosscutSled");
    // Tooling is not a product: no craft XP
    assert.strictEqual(shop.progression.xp, 0);
  });

  it("puts a shop-built worktable upgrade into upgrade storage", () => {
    const shop = benchShop([
      workspaceMachine({
        selectedOperationId: "buildMaterialShelf",
        processingMaterials: [
          board("pallet", 36, 4, 2),
          board("pallet", 36, 4, 2),
        ],
        operationProgress: {
          status: "inProgress",
          phaseIndex: 0,
          ticksRemaining: 1,
        },
      }),
    ]);
    assert.ok(finishAttendedWork(shop.game, shop.machine("workspace")));
    assert.deepStrictEqual(shop.storageUpgrades.upgrades, ["materialShelf"]);
  });
});
