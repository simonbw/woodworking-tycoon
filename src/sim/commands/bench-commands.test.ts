import assert from "node:assert";
import { describe, it } from "node:test";
import {
  benchWorkPallet,
  benchWorkShop,
} from "../../../tests/fixtures/bench-work-shop";
import { cuttingBoardShop } from "../../../tests/fixtures/cutting-board-shop";
import { handToolsShop } from "../../../tests/fixtures/hand-tools-shop";
import {
  benchGroupAt,
  memberFor,
  placementInFrame,
} from "../../game/bench-work/bench-group";
import { benchPlacementFor } from "../../game/bench-work/bench-layout";
import { palletSlotId } from "../../game/bench-work/pallet-geometry";
import { clampsFree } from "../../game/Clamp";
import { GameState } from "../../game/GameState";
import { getMachines, MachineState } from "../../game/Machine";
import { panelWidth } from "../../game/Materials";
import { isPanel } from "../../game/panel-helpers";
import { ShopDriver } from "../driver/ShopDriver";
import { MachineEntity } from "../entities/MachineEntity";
import { finishAttendedWork } from "./machine-commands";
import {
  arrangeBenchMaterial,
  emitBenchDust,
  gatherBenchPieces,
  pryPalletNail,
  startGlueUp,
} from "./bench-commands";

/**
 * The bench-work commands' contract: the old operation-actions commits —
 * prying, the clamps-first glue-up, arranging, gathering across a bench
 * group, hand-work dust — now mutate entities through the command layer,
 * with the same guards and the same quiet refusals. Driven through the
 * bench fixtures the old sequence tier uses.
 */

const WORKBENCH = "workspace";

/** The bench-work shop with its pallet carried in and staged on the bench. */
function palletShop(): ShopDriver {
  const shop = new ShopDriver({ state: benchWorkShop });
  shop
    .takeFromFloor((material) => material.type === "pallet")
    .standAtOperatorCell(WORKBENCH)
    .load(WORKBENCH, (material) => material.type === "pallet", 1);
  return shop;
}

describe("prying a pallet apart", () => {
  it("pulls nail by nail: nails to stock, boards freed under their slot ids", () => {
    const shop = palletShop();
    const bench = shop.machine(WORKBENCH);
    const staged = bench.state.inputMaterials.find((m) => m.type === "pallet");
    assert.ok(staged && staged.type === "pallet");
    const totalNails = staged.nails.length;
    assert.strictEqual(totalNails, 24, "a full pallet holds 24 nails");
    const nailsBefore = shop.consumables.stock.nails ?? 0;

    // The first pull: one nail to the shop's stock, no board free yet
    // (deck 0 still holds two more nails).
    assert.strictEqual(pryPalletNail(shop.game, bench), true);
    assert.strictEqual(shop.consumables.stock.nails ?? 0, nailsBefore + 1);
    const palletAfter = bench.state.inputMaterials.find(
      (m) => m.type === "pallet",
    );
    assert.ok(palletAfter && palletAfter.type === "pallet");
    assert.strictEqual(palletAfter.nails.length, totalNails - 1);
    assert.strictEqual(
      bench.state.inputMaterials.filter((m) => m.type === "board").length,
      1,
      "only the fixture's staged board so far",
    );

    // The whole teardown, pull by pull through the same command.
    shop.performWork(WORKBENCH);
    assert.strictEqual(
      shop.consumables.stock.nails ?? 0,
      nailsBefore + totalNails,
      "every nail landed in the shop's stock",
    );
    assert.strictEqual(
      bench.state.inputMaterials.some((m) => m.type === "pallet"),
      false,
      "the pallet is gone after the last board comes free",
    );

    // Every board came free under its stable pallet-slot id, seated on
    // the bench where the toss left it.
    const freedIds = [
      ...Array.from({ length: 8 }, (_, i) =>
        palletSlotId(benchWorkPallet, { kind: "deck", index: i }),
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        palletSlotId(benchWorkPallet, { kind: "stringer", index: i }),
      ),
    ];
    const onBench = new Set(bench.state.inputMaterials.map((m) => m.id));
    for (const id of freedIds) {
      assert.ok(onBench.has(id), `freed board ${id} lies on the bench`);
      assert.ok(
        bench.state.benchLayout?.[id],
        `freed board ${id} has a seat on the bench top`,
      );
    }
  });

  it("clears the freed stock back into the arms with takeStock", () => {
    const shop = palletShop();
    shop.performWork(WORKBENCH);
    const freed = shop.machine(WORKBENCH).state.inputMaterials.length;
    assert.strictEqual(freed, 12, "11 pallet boards plus the staged board");
    shop.takeStock(WORKBENCH);
    assert.strictEqual(
      shop.machine(WORKBENCH).state.inputMaterials.length,
      0,
      "the bench's bay is clear",
    );
    assert.strictEqual(
      shop.stock((m) => m.type === "board").length,
      12,
      "every board is in the arms or piled at the feet",
    );
  });

  it("refuses to pry while the bench is mid-operation", () => {
    const state: GameState = {
      ...benchWorkShop,
      materialPiles: [],
      machines: [
        {
          ...benchWorkShop.machines[0],
          inputMaterials: [
            ...benchWorkShop.machines[0].inputMaterials,
            benchWorkPallet,
          ],
          operationProgress: {
            status: "inProgress",
            phaseIndex: 0,
            ticksRemaining: 5,
          },
        },
      ],
    };
    const shop = new ShopDriver({ state });
    const bench = shop.machine(WORKBENCH);
    const before = bench.state;
    assert.strictEqual(pryPalletNail(shop.game, bench), false);
    assert.strictEqual(bench.state, before, "a refusal changes nothing");
    assert.strictEqual(shop.consumables.stock.nails ?? 0, 0);
  });

  it("refuses a pry from across the shop", () => {
    const shop = palletShop();
    shop.standAt([8, 8]);
    assert.strictEqual(
      pryPalletNail(shop.game, shop.machine(WORKBENCH)),
      false,
    );
    shop.standAtOperatorCell(WORKBENCH);
    assert.strictEqual(pryPalletNail(shop.game, shop.machine(WORKBENCH)), true);
  });
});

describe("the clamps-first glue-up", () => {
  it("start → cure → cured panel, clamps checked out and returned", () => {
    const shop = new ShopDriver({ state: cuttingBoardShop });
    const bench = shop.machine(WORKBENCH);
    const owned = shop.consumables.clamps;
    assert.strictEqual(clampsFree(owned, [bench.state]), owned);

    const runIds = bench.state.inputMaterials.map((m) => m.id);
    assert.strictEqual(startGlueUp(shop.game, bench, runIds), true);
    assert.strictEqual(bench.state.selectedOperationId, "glueUpPanel");
    assert.strictEqual(bench.state.operationProgress.status, "inProgress");
    assert.strictEqual(bench.state.processingMaterials.length, 3);
    // The start IS the checkout: two clamps for a 24-inch run.
    assert.strictEqual(clampsFree(owned, [bench.state]), owned - 2);

    // The tighten is the attended phase; finishing rolls into the cure.
    assert.strictEqual(finishAttendedWork(shop.game, bench), true);
    assert.strictEqual(bench.state.operationProgress.status, "inProgress");
    assert.strictEqual(bench.state.operationProgress.phaseIndex, 1);

    // The cure runs out on the clock, hands-free.
    for (
      let i = 0;
      i < 2000 && bench.state.operationProgress.status === "inProgress";
      i++
    ) {
      shop.tick();
    }
    assert.strictEqual(bench.state.operationProgress.status, "notStarted");
    const panel = bench.state.outputMaterials.find(isPanel);
    assert.ok(panel && isPanel(panel), "a cured panel lies on the bench");
    assert.strictEqual(panel.strips.length, 3);
    assert.strictEqual(panelWidth(panel), 6);
    // The cure finishing is the return.
    assert.strictEqual(clampsFree(owned, [bench.state]), owned);
  });

  it("glueUp drives the whole job — three strips make a 6-inch panel", () => {
    const shop = new ShopDriver({ state: cuttingBoardShop });
    shop.glueUp(WORKBENCH);
    const panel = shop.inventory.find(isPanel);
    assert.ok(panel && isPanel(panel), "the panel comes off into the hands");
    assert.strictEqual(panel.strips.length, 3);
    assert.strictEqual(panelWidth(panel), 6);
    assert.strictEqual(panel.surface, "rough");
    // The composition decided the credited recipe
    assert.strictEqual(
      shop.machine(WORKBENCH).state.selectedOperationId,
      "glueUpPanel",
    );
  });

  it("refuses the run when the rack is short of clamps", () => {
    const state: GameState = { ...cuttingBoardShop, clamps: 1 };
    const shop = new ShopDriver({ state });
    const bench = shop.machine(WORKBENCH);
    assert.strictEqual(
      startGlueUp(
        shop.game,
        bench,
        bench.state.inputMaterials.map((m) => m.id),
      ),
      false,
    );
    assert.strictEqual(bench.state.operationProgress.status, "notStarted");
    assert.throws(
      () => new ShopDriver({ state }).glueUp(WORKBENCH),
      /would not start/,
    );
  });

  it("round-trips mid-cure state through the save file byte-identically", () => {
    const shop = new ShopDriver({ state: cuttingBoardShop });
    const bench = shop.machine(WORKBENCH);
    startGlueUp(
      shop.game,
      bench,
      bench.state.inputMaterials.map((m) => m.id),
    );
    finishAttendedWork(shop.game, bench);
    shop.tick(3); // a few minutes into the cure
    assert.strictEqual(bench.state.operationProgress.status, "inProgress");

    const save = shop.save();
    const reloaded = new ShopDriver({ save });
    assert.strictEqual(
      JSON.stringify(reloaded.save()),
      JSON.stringify(save),
      "a save landed mid-cure reloads byte-identically",
    );
    assert.strictEqual(
      reloaded.machine(WORKBENCH).state.operationProgress.status,
      "inProgress",
    );
  });
});

describe("arranging the bench top", () => {
  it("commits a drag as real bench state, and ignores unknown pieces", () => {
    const shop = new ShopDriver({ state: benchWorkShop });
    const bench = shop.machine(WORKBENCH);
    const placement = { xIn: 5, yIn: 6, angleDeg: 90, flipped: true };
    assert.strictEqual(
      arrangeBenchMaterial(shop.game, bench, "fx-bench-board", placement),
      true,
    );
    assert.deepStrictEqual(
      bench.state.benchLayout?.["fx-bench-board"],
      placement,
    );
    const before = bench.state;
    assert.strictEqual(
      arrangeBenchMaterial(shop.game, bench, "not-a-piece", placement),
      false,
    );
    assert.strictEqual(bench.state, before);
  });

  it("leaves the piece it just set down on top of the pile", () => {
    const under = benchWorkShop.machines[0].inputMaterials[0];
    const over = { ...under, id: "fx-bench-board-2" };
    const state: GameState = {
      ...benchWorkShop,
      machines: [
        { ...benchWorkShop.machines[0], inputMaterials: [under, over] },
      ],
    };
    const shop = new ShopDriver({ state });
    const bench = shop.machine(WORKBENCH);
    assert.deepStrictEqual(
      bench.state.inputMaterials.map((material) => material.id),
      [under.id, over.id],
      "the second board starts on top",
    );
    assert.strictEqual(
      arrangeBenchMaterial(shop.game, bench, under.id, {
        xIn: 12,
        yIn: 12,
        angleDeg: 0,
        flipped: false,
      }),
      true,
    );
    assert.deepStrictEqual(
      bench.state.inputMaterials.map((material) => material.id),
      [over.id, under.id],
      "the board that was moved is now the last one down",
    );
  });

  it("keeps finished work in its own bay when it is set down", () => {
    const board = benchWorkShop.machines[0].inputMaterials[0];
    const done = { ...board, id: "fx-bench-done" };
    const other = { ...board, id: "fx-bench-done-2" };
    const state: GameState = {
      ...benchWorkShop,
      machines: [
        {
          ...benchWorkShop.machines[0],
          inputMaterials: [board],
          outputMaterials: [done, other],
        },
      ],
    };
    const shop = new ShopDriver({ state });
    const bench = shop.machine(WORKBENCH);
    assert.strictEqual(
      arrangeBenchMaterial(shop.game, bench, done.id, {
        xIn: 4,
        yIn: 4,
        angleDeg: 0,
        flipped: false,
      }),
      true,
    );
    assert.deepStrictEqual(
      bench.state.inputMaterials.map((material) => material.id),
      [board.id],
      "staged stock is untouched",
    );
    assert.deepStrictEqual(
      bench.state.outputMaterials.map((material) => material.id),
      [other.id, done.id],
    );
  });
});

/** A shop-built table, dropped straight onto the floor. */
function table(
  machineTypeId: MachineState["machineTypeId"],
  position: [number, number],
): MachineState {
  return {
    machineTypeId,
    position,
    rotation: 0,
    inputMaterials: [],
    processingMaterials: [],
    outputMaterials: [],
    selectedOperationId: "",
    operationProgress: {
      status: "notStarted",
      phaseIndex: 0,
      ticksRemaining: 0,
    },
    tools: [],
  };
}

/**
 * The cutting-board shop with its three staged strips moved off the
 * makeshift bench and onto a pair of worktables pushed shoulder to
 * shoulder — two strips on the left table, one on the right.
 */
function joinedTablesShop(): {
  shop: ShopDriver;
  left: MachineEntity;
  right: MachineEntity;
} {
  const strips = cuttingBoardShop.machines[0].inputMaterials;
  const state: GameState = {
    ...cuttingBoardShop,
    machines: [
      { ...cuttingBoardShop.machines[0], inputMaterials: [], benchLayout: {} },
      {
        ...table("worktable1x2", [5, 6]),
        inputMaterials: [strips[0], strips[1]],
      },
      { ...table("worktable1x2", [9, 6]), inputMaterials: [strips[2]] },
    ],
  };
  const shop = new ShopDriver({ state });
  const tables = [...shop.game.entities.byConstructor(MachineEntity)].filter(
    (entity) => entity.state.machineTypeId === "worktable1x2",
  );
  const left = tables.find((entity) => entity.state.position[0] === 5)!;
  const right = tables.find((entity) => entity.state.position[0] === 9)!;
  return { shop, left, right };
}

describe("gathering across a bench group", () => {
  it("slides seam-straddling pieces onto one table and back, nothing moving", () => {
    const { shop, left, right } = joinedTablesShop();
    const strip = right.state.inputMaterials[0];

    const allStates = () =>
      [...shop.game.entities.byConstructor(MachineEntity)].map((e) => e.state);
    const framePlacementOf = (owner: MachineEntity) => {
      const group = benchGroupAt(getMachines(allStates()), owner.view());
      const member = memberFor(group, owner.view())!;
      return placementInFrame(
        group,
        member,
        benchPlacementFor(member.machine, strip),
      );
    };

    const before = framePlacementOf(right);
    const allIds = [...left.state.inputMaterials.map((m) => m.id), strip.id];
    assert.strictEqual(gatherBenchPieces(shop.game, left, allIds), true);
    assert.strictEqual(right.state.inputMaterials.length, 0);
    assert.strictEqual(left.state.inputMaterials.length, 3);
    assert.ok(left.state.benchLayout?.[strip.id], "the arrival has a seat");

    // Nothing moved an inch — same spot, bookkept by the left table now.
    const after = framePlacementOf(left);
    assert.ok(Math.abs(after.xIn - before.xIn) < 1e-9);
    assert.ok(Math.abs(after.yIn - before.yIn) < 1e-9);

    // And back again, still without moving.
    assert.strictEqual(gatherBenchPieces(shop.game, right, [strip.id]), true);
    assert.ok(
      right.state.inputMaterials.some((m) => m.id === strip.id),
      "the strip is bookkept by the right table again",
    );
    const returned = framePlacementOf(right);
    assert.ok(Math.abs(returned.xIn - before.xIn) < 1e-9);
    assert.ok(Math.abs(returned.yIn - before.yIn) < 1e-9);
  });

  it("commits a glue-up whose strips started on two different tables", () => {
    const { shop, left, right } = joinedTablesShop();
    const allIds = [
      ...left.state.inputMaterials.map((m) => m.id),
      right.state.inputMaterials[0].id,
    ];
    assert.strictEqual(gatherBenchPieces(shop.game, left, allIds), true);
    // All three in one bay now, so the tighten commits.
    shop.standAt(left.view().absoluteOperationPosition!);
    assert.strictEqual(startGlueUp(shop.game, left, allIds), true);
    assert.strictEqual(left.state.selectedOperationId, "glueUpPanel");
  });

  it("a lone bench has no group to gather from", () => {
    const shop = new ShopDriver({ state: cuttingBoardShop });
    const bench = shop.machine(WORKBENCH);
    const before = bench.state;
    assert.strictEqual(
      gatherBenchPieces(shop.game, bench, ["test-strip-2"]),
      false,
    );
    assert.strictEqual(bench.state, before);
  });
});

describe("hand-work dust", () => {
  it("lands a throttled emission on the shop floor", () => {
    const shop = new ShopDriver({ state: benchWorkShop });
    assert.deepStrictEqual(shop.dustLayer.map, {});
    assert.strictEqual(emitBenchDust(shop.game, shop.machine(WORKBENCH)), true);
    assert.ok(
      Object.keys(shop.dustLayer.map).length > 0,
      "a sanding stroke lays dust down",
    );
  });

  it("emits nothing when the plan sheds no dust", () => {
    const shop = new ShopDriver({ state: handToolsShop });
    assert.strictEqual(
      emitBenchDust(shop.game, shop.machine(WORKBENCH)),
      false,
    );
    assert.deepStrictEqual(shop.dustLayer.map, {});
  });
});

describe("run() over interactive hand work", () => {
  it("commits a sanding stroke through the same start/finish commands", () => {
    const shop = new ShopDriver({ state: benchWorkShop });
    shop.standAtOperatorCell(WORKBENCH).run(WORKBENCH);
    const output = shop.machine(WORKBENCH).state.outputMaterials[0];
    assert.ok(output && output.type === "board");
    assert.strictEqual(output.surface, "smooth");
  });
});
