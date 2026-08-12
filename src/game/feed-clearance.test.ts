import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "./board-helpers";
import { CellMap } from "./CellMap";
import {
  describeFeedShortfall,
  feedClearanceShortfall,
  feedRunAvailable,
  feedRunNeeded,
  feedRunRulers,
  stockTravelLength,
} from "./feed-clearance";
import { freshMachineState } from "./game-actions/machine-actions";
import { operateMachineAction } from "./game-actions/player-actions";
import { GameState } from "./GameState";
import { Machine, MachineState } from "./Machine";
import { machineCanOperate, NO_SUPPLY, shopSupply } from "./machine-helpers";
import { initialGameState } from "./initialGameState";
import { makeMaterial } from "./material-helpers";
import { FinishedProduct } from "./Materials";

function machineAt(
  machineTypeId: MachineState["machineTypeId"],
  position: [number, number],
  overrides: Partial<MachineState> = {},
): MachineState {
  return {
    ...freshMachineState(machineTypeId, initialGameState.progression),
    position,
    ...overrides,
  };
}

/** The starter garage (12×16) with only these machines on the floor. */
function shopWith(...machines: MachineState[]): GameState {
  return {
    ...initialGameState,
    materialPiles: [],
    machines,
    progression: {
      ...initialGameState.progression,
      unlockedSkills: [
        ...initialGameState.progression.unlockedSkills,
        "basicMilling" as const,
      ],
    },
  };
}

/** An 8-footer ready to rip: one straight edge to ride the fence. */
const longBoard = () =>
  board("walnut", 96, 6, 4, "rough", { faces: 1, edges: 1 });

describe("stockTravelLength", () => {
  it("is the length for stock with one, and null otherwise", () => {
    assert.strictEqual(stockTravelLength(longBoard()), 96);
    assert.strictEqual(
      stockTravelLength(
        makeMaterial<FinishedProduct>({ type: "shelf", species: "pine" }),
      ),
      null,
    );
  });
});

describe("feedRunNeeded", () => {
  it("credits half the bed, rounded in the stock's favor", () => {
    // Table saw: 2 cells of bed along the feed axis → 1 credited per side
    const saw = new Machine(machineAt("jobsiteTableSaw", [6, 8]));
    assert.strictEqual(feedRunNeeded(saw, 96), 7);
    assert.strictEqual(feedRunNeeded(saw, 24), 1);
    assert.strictEqual(feedRunNeeded(saw, 12), 0);
    // Off-grid stock rounds up: a 30" board still needs its third foot
    assert.strictEqual(feedRunNeeded(saw, 30), 2);
    // Planer: 3 cells of bed → 2 credited per side
    const planer = new Machine(machineAt("lunchboxPlaner", [6, 8]));
    assert.strictEqual(feedRunNeeded(planer, 96), 6);
  });
});

describe("feedRunAvailable", () => {
  it("counts open lane out to the walls", () => {
    // Saw centered on the 16' axis: footprint rows 7–8, lane column 6 —
    // exactly 7 cells to each wall, the run an 8-footer needs
    const state = shopWith(machineAt("jobsiteTableSaw", [6, 8]));
    const saw = new Machine(state.machines[0]);
    const run = feedRunAvailable(saw, CellMap.fromGameState(state), 8);
    assert.deepStrictEqual(run, { infeed: 7, outfeed: 7 });
  });

  it("follows the machine's rotation", () => {
    // Rotated a quarter turn the lane runs along the 12' axis instead:
    // footprint columns 5–6 on rows 7–9, so 5 cells out to either wall
    const state = shopWith(
      machineAt("jobsiteTableSaw", [6, 8], { rotation: 1 }),
    );
    const saw = new Machine(state.machines[0]);
    const run = feedRunAvailable(saw, CellMap.fromGameState(state), 8);
    assert.deepStrictEqual(run, { infeed: 5, outfeed: 5 });
  });

  it("is cut short by a machine in the lane", () => {
    // The can occupies rows 2–3 in the outfeed lane: run stops at row 4
    const state = shopWith(
      machineAt("jobsiteTableSaw", [6, 8]),
      machineAt("garbageCan", [6, 2]),
    );
    const saw = new Machine(state.machines[0]);
    const run = feedRunAvailable(saw, CellMap.fromGameState(state), 8);
    assert.deepStrictEqual(run, { infeed: 7, outfeed: 3 });
  });

  it("passes over a bare worktable — an outfeed table", () => {
    const state = shopWith(
      machineAt("jobsiteTableSaw", [6, 8]),
      machineAt("worktable1x2", [6, 4]),
    );
    const saw = new Machine(state.machines[0]);
    const run = feedRunAvailable(saw, CellMap.fromGameState(state), 8);
    assert.deepStrictEqual(run, { infeed: 7, outfeed: 7 });
  });
});

describe("feedClearanceShortfall", () => {
  it("clears stock that has room, and short stock anywhere", () => {
    const state = shopWith(machineAt("jobsiteTableSaw", [6, 8]));
    const saw = new Machine(state.machines[0]);
    const cellMap = CellMap.fromGameState(state);
    assert.strictEqual(
      feedClearanceShortfall(saw, [longBoard()], cellMap),
      null,
    );
    // Jammed near the wall, a 2-footer still runs — needed run is 1
    const tight = shopWith(machineAt("jobsiteTableSaw", [6, 13]));
    const tightSaw = new Machine(tight.machines[0]);
    assert.strictEqual(
      feedClearanceShortfall(
        tightSaw,
        [board("walnut", 24, 6, 4, "rough", { faces: 1, edges: 1 })],
        CellMap.fromGameState(tight),
      ),
      null,
    );
  });

  it("reports which side is short, and by how much", () => {
    // A cell toward the operator's wall: 6 in, 7 out — one short of what
    // an 8' rip needs at the infeed
    const state = shopWith(machineAt("jobsiteTableSaw", [6, 9]));
    const saw = new Machine(state.machines[0]);
    const shortfall = feedClearanceShortfall(
      saw,
      [longBoard()],
      CellMap.fromGameState(state),
    );
    assert.ok(shortfall);
    assert.strictEqual(shortfall.needed, 7);
    assert.deepStrictEqual(shortfall.available, { infeed: 6, outfeed: 7 });
    const line = describeFeedShortfall(shortfall);
    assert.match(line, /8' stock needs 7' of clear run at the infeed/);
    assert.match(line, /only 6'/);
  });

  it("never troubles a machine stock doesn't travel through", () => {
    const state = shopWith(machineAt("miterSaw", [6, 9]));
    const saw = new Machine(state.machines[0]);
    assert.strictEqual(
      feedClearanceShortfall(saw, [longBoard()], CellMap.fromGameState(state)),
      null,
    );
  });
});

describe("feedRunRulers", () => {
  it("gives each side's run with the geometry to draw it", () => {
    // Saw at [6,8]: footprint rows 7–8 on column 6, operator below —
    // infeed runs down the shop from row 8, outfeed up from row 7
    const state = shopWith(machineAt("jobsiteTableSaw", [6, 8]));
    const saw = new Machine(state.machines[0]);
    const rulers = feedRunRulers(saw, CellMap.fromGameState(state), 30);
    assert.ok(rulers);
    assert.deepStrictEqual(rulers.infeed, {
      run: 7,
      edgeCell: [6, 8],
      direction: [0, 1],
    });
    assert.deepStrictEqual(rulers.outfeed, {
      run: 7,
      edgeCell: [6, 7],
      direction: [0, -1],
    });
  });

  it("stops at whatever blocks the lane, and honors the cap", () => {
    const state = shopWith(
      machineAt("jobsiteTableSaw", [6, 8]),
      machineAt("garbageCan", [6, 2]),
    );
    const saw = new Machine(state.machines[0]);
    const cellMap = CellMap.fromGameState(state);
    assert.strictEqual(feedRunRulers(saw, cellMap, 30)?.outfeed.run, 3);
    assert.strictEqual(feedRunRulers(saw, cellMap, 5)?.infeed.run, 5);
  });

  it("is null for machines stock doesn't travel through", () => {
    const state = shopWith(machineAt("miterSaw", [6, 8]));
    assert.strictEqual(
      feedRunRulers(
        new Machine(state.machines[0]),
        CellMap.fromGameState(state),
        30,
      ),
      null,
    );
  });
});

describe("clearance in operability", () => {
  const stagedSaw = (position: [number, number]) =>
    machineAt("jobsiteTableSaw", position, {
      inputMaterials: [longBoard()],
      poweredOn: true,
    });

  it("blocks machineCanOperate only when the supply carries the floor", () => {
    const state = shopWith(stagedSaw([6, 9]));
    const saw = new Machine(state.machines[0]);
    assert.strictEqual(
      machineCanOperate(saw, shopSupply(state), state.progression),
      false,
    );
    // Without a cellMap (bare supply) clearance is treated as unlimited
    assert.strictEqual(
      machineCanOperate(saw, NO_SUPPLY, state.progression),
      true,
    );
  });

  it("keeps operateMachineAction from starting a cut without room", () => {
    const cramped = shopWith(stagedSaw([6, 9]));
    const refused = operateMachineAction(new Machine(cramped.machines[0]))(
      cramped,
    );
    assert.strictEqual(
      refused.machines[0].operationProgress.status,
      "notStarted",
    );

    const roomy = shopWith(stagedSaw([6, 8]));
    const running = operateMachineAction(new Machine(roomy.machines[0]))(roomy);
    assert.strictEqual(
      running.machines[0].operationProgress.status,
      "inProgress",
    );
  });
});
