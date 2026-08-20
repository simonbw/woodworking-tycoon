import assert from "node:assert";
import { describe, it } from "node:test";
import { BaseEntity } from "../../core/entity/BaseEntity";
import { GameEventMap } from "../../core/entity/Entity";
import { on } from "../../core/entity/handler";
import { board } from "../../game/board-helpers";
import { cellDust } from "../../game/Dust";
import { GameState } from "../../game/GameState";
import { initialGameState } from "../../game/initialGameState";
import { GLUE_CURE_TICKS } from "../../game/machines/workspace";
import { makeMaterial } from "../../game/material-helpers";
import { MachineState } from "../../game/Machine";
import { FinishedProduct } from "../../game/Materials";
import { ScavengingTrip } from "../../game/Person";
import { SoundEvent } from "../../game/SoundEvent";
import { toggleMachinePower } from "../commands/machine-commands";
import { ShopDriver } from "../driver/ShopDriver";
import { Vector } from "../../game/Vectors";

/**
 * The machines' slice of the sim minute: an in-progress operation counts
 * down only while its phase's attendance is satisfied, sheds sawdust
 * exactly while it is
 * cutting, and on the last tick delivers outputs, XP and a completion
 * cue through the shared commit.
 *
 * Everything here is staged as machine state and advanced with
 * `shop.tick()` — the pass under test is the clock's, not a command's
 * (the commands that start and hand-finish work are covered in
 * `commands/machine-commands.test.ts`).
 */

/** The bench at [1,2] rotation 0 — its operation cell lands at [1,4]. */
const WORKSPACE_OPERATION_CELL: Vector = [1, 4];

/** A miter saw at [1,1]; its operation cell lands at [1,3]. Hand-fed and
 * attended — the representative tick-driven countdown now that bench
 * hand work is interactive (the tick never advances those). */
const SAW_OPERATION_CELL: Vector = [1, 3];

/** Somewhere across the shop, well clear of every station under test. */
const ACROSS_THE_SHOP: Vector = [8, 8];

function shopState(overrides: Partial<GameState> = {}): GameState {
  return { ...initialGameState, ...overrides };
}

function workspaceMachine(overrides: Partial<MachineState>): MachineState {
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
    // The kit on the rail: several suites here run finishing operations
    tools: ["finishingKit"],
    ...overrides,
  };
}

function sawMachine(overrides: Partial<MachineState> = {}): MachineState {
  return {
    machineTypeId: "miterSaw",
    position: [1, 1],
    rotation: 0,
    inputMaterials: [],
    processingMaterials: [board("pallet", 36, 4, 2)],
    outputMaterials: [],
    selectedOperationId: "cutBoard",
    selectedParameters: { cutPosition: 24, angle: 0 },
    operationProgress: {
      status: "inProgress",
      phaseIndex: 0,
      ticksRemaining: 3,
    },
    tools: [],
    poweredOn: true,
    ...overrides,
  };
}

/** A shop holding one saw mid-cut, the player at it with the key held. */
function sawingShop(machine: MachineState = sawMachine()): ShopDriver {
  const shop = new ShopDriver({ state: shopState({ machines: [machine] }) });
  return shop.standAt(SAW_OPERATION_CELL).holdOperate(true);
}

/** An away trip on the scavenging circuit, empty-handed unless told otherwise. */
function scavengingTrip(overrides: Partial<ScavengingTrip>): ScavengingTrip {
  return {
    kind: "scavenging",
    startTick: 0,
    stops: [],
    stopsSearched: 0,
    phase: { kind: "searching", doneTick: 999 },
    ...overrides,
  };
}

/** Five smooth maple strips, mid-glue-up. */
function glueStrips() {
  return Array.from({ length: 5 }, () => board("maple", 24, 2, 4, "smooth"));
}

/** A raw maple cutting board, ready for the oil recipe's two phases. */
function rawCuttingBoard(): FinishedProduct {
  return makeMaterial<FinishedProduct>({
    type: "simpleCuttingBoard",
    species: "maple",
  });
}

/** Records every cue the sim announces. */
class SoundRecorder extends BaseEntity {
  sounds: SoundEvent[] = [];

  @on("sound")
  onSound({ sound }: GameEventMap["sound"]) {
    this.sounds.push(sound);
  }
}

describe("the machine minute pass", () => {
  it("leaves idle machines untouched", () => {
    const shop = new ShopDriver({
      state: shopState({ machines: [workspaceMachine({})] }),
    });
    const before = shop.machine("workspace").state;
    shop.tick();
    assert.strictEqual(shop.machine("workspace").state, before);
  });

  it("counts down an attended operation while the player is at the machine", () => {
    const shop = sawingShop();
    shop.tick();
    assert.deepStrictEqual(shop.machine("miterSaw").state.operationProgress, {
      status: "inProgress",
      phaseIndex: 0,
      ticksRemaining: 2,
    });
  });

  it("pauses an attended operation while the player is elsewhere", () => {
    const shop = sawingShop().standAt(ACROSS_THE_SHOP);
    const before = shop.machine("miterSaw").state;
    shop.tick();
    assert.strictEqual(shop.machine("miterSaw").state, before);
  });

  it("pauses attended work during away trips — you're not there to do it", () => {
    const shop = new ShopDriver({
      state: shopState({
        tick: 10,
        machines: [sawMachine({})],
        player: {
          ...initialGameState.player,
          // Standing at the cell doesn't count while away
          position: SAW_OPERATION_CELL,
          away: scavengingTrip({}),
        },
      }),
    });
    shop.holdOperate(true).tick();
    assert.strictEqual(
      shop.machine("miterSaw").state.operationProgress.ticksRemaining,
      3,
    );
  });

  it("applies the operation output when the countdown finishes", () => {
    const shop = sawingShop(
      sawMachine({
        operationProgress: {
          status: "inProgress",
          phaseIndex: 0,
          ticksRemaining: 1,
        },
      }),
    );
    shop.tick();
    const finished = shop.machine("miterSaw").state;

    // The cut parts: the kept 24" piece and the 12" offcut
    assert.strictEqual(finished.outputMaterials.length, 2);
    assert.ok(finished.outputMaterials.every((m) => m.type === "board"));
    assert.deepStrictEqual(finished.processingMaterials, []);
    assert.deepStrictEqual(finished.operationProgress, {
      status: "notStarted",
      phaseIndex: 0,
      ticksRemaining: 0,
    });
  });

  it("announces an operation-complete cue when an operation finishes", () => {
    const shop = sawingShop(
      sawMachine({
        operationProgress: {
          status: "inProgress",
          phaseIndex: 0,
          ticksRemaining: 1,
        },
      }),
    );
    const recorder = shop.game.addEntity(new SoundRecorder());
    shop.tick();
    assert.deepStrictEqual(recorder.sounds, [
      {
        kind: "operation-complete",
        machineTypeId: "miterSaw",
        operationId: "cutBoard",
      },
    ]);
  });

  it("awards craft XP equal to sell value when a product completes", () => {
    // The oil soak is hands-free, so its last tick is a tick-completed
    // product — XP lands exactly as it would from a hand-finished one
    const shop = new ShopDriver({
      state: shopState({
        machines: [
          workspaceMachine({
            selectedOperationId: "oilCuttingBoard",
            processingMaterials: [rawCuttingBoard()],
            operationProgress: {
              status: "inProgress",
              phaseIndex: 1,
              ticksRemaining: 1,
            },
          }),
        ],
      }),
    });
    shop.tick();
    // Oiled maple cutting board sells for $30 -> 30 XP
    assert.strictEqual(shop.progression.xp, 30);
  });

  it("leaves the interactive wipe to the bench view — the clock never advances it", () => {
    // The wipe is stroke work now (the finishing kit's rag); its phase
    // resolves through the bench view's finish commit, not the clock —
    // even with the player standing right at the bench
    const shop = new ShopDriver({
      state: shopState({
        machines: [
          workspaceMachine({
            selectedOperationId: "oilCuttingBoard",
            processingMaterials: [rawCuttingBoard()],
            operationProgress: {
              status: "inProgress",
              phaseIndex: 0,
              ticksRemaining: 1,
            },
          }),
        ],
      }),
    });
    shop.standAt(WORKSPACE_OPERATION_CELL).holdOperate(true);
    const before = shop.machine("workspace").state;
    shop.tick();
    assert.strictEqual(shop.machine("workspace").state, before);
  });

  it("soaks on the clock whether or not anyone stands at the bench", () => {
    const soaking = () =>
      workspaceMachine({
        selectedOperationId: "oilCuttingBoard",
        processingMaterials: [rawCuttingBoard()],
        operationProgress: {
          status: "inProgress",
          phaseIndex: 1,
          ticksRemaining: 4,
        },
      });
    for (const at of [ACROSS_THE_SHOP, WORKSPACE_OPERATION_CELL]) {
      const shop = new ShopDriver({
        state: shopState({ machines: [soaking()] }),
      });
      shop.standAt(at).tick();
      assert.strictEqual(
        shop.machine("workspace").state.operationProgress.ticksRemaining,
        3,
      );
    }
  });

  it("enters a hands-free phase from a boundary without the player", () => {
    // A boundary state (phase done, ticksRemaining 0): curing needs nobody,
    // so the machine moves on by itself
    const shop = new ShopDriver({
      state: shopState({
        machines: [
          workspaceMachine({
            selectedOperationId: "glueUpPanel",
            processingMaterials: glueStrips(),
            operationProgress: {
              status: "inProgress",
              phaseIndex: 0,
              ticksRemaining: 0,
            },
          }),
        ],
      }),
    });
    shop.standAt(ACROSS_THE_SHOP).tick();
    assert.deepStrictEqual(shop.machine("workspace").state.operationProgress, {
      status: "inProgress",
      phaseIndex: 1,
      ticksRemaining: GLUE_CURE_TICKS,
    });
  });
});

describe("dust from machine work", () => {
  /**
   * A planer at [1,1] (footprint [1..2, 0..2], operation cell [1,3])
   * mid-way through planing walnut. The 5"-wide board is exactly the
   * cut-load reference, so the dust numbers below read straight off
   * dustOutput.
   */
  function planingShop(
    overrides: Partial<GameState> = {},
    stock = board("walnut", 48, 5, 4),
  ): ShopDriver {
    const planer: MachineState = {
      machineTypeId: "lunchboxPlaner",
      position: [1, 1],
      rotation: 0,
      selectedOperationId: "plane",
      selectedParameters: { targetThickness: 4 },
      operationProgress: {
        status: "inProgress",
        phaseIndex: 0,
        ticksRemaining: 5,
      },
      inputMaterials: [],
      processingMaterials: [stock],
      outputMaterials: [],
      tools: [],
      poweredOn: true,
    };
    const shop = new ShopDriver({
      state: shopState({ machines: [planer], ...overrides }),
    });
    return shop.standAt([1, 3]);
  }

  /** The same shop with the planer swapped for a hand-fed jointer. */
  function jointingShop(overrides: Partial<GameState> = {}): ShopDriver {
    const shop = planingShop(overrides);
    const planer = shop.machine("lunchboxPlaner");
    planer.state = {
      ...planer.state,
      machineTypeId: "jointer",
      selectedOperationId: "jointFace",
      selectedParameters: undefined,
    };
    return shop;
  }

  it("lands species-tagged dust around the machine while it cuts", () => {
    const shop = planingShop();
    shop.tick();
    assert.strictEqual(
      shop.machine("lunchboxPlaner").state.operationProgress.ticksRemaining,
      4,
    );
    // The planer's dustOutput (4/tick): 70% split over the seven core
    // cells (six footprint cells + operation position), 30% over the
    // eleven ring cells
    const dust = shop.dustLayer.map;
    assert.ok(Math.abs(cellDust(dust, [1, 1]) - 0.4) < 1e-9);
    assert.ok(Math.abs(cellDust(dust, [1, 3]) - 0.4) < 1e-9);
    assert.ok(Math.abs(cellDust(dust, [0, 1]) - 1.2 / 11) < 1e-9);
    assert.ok((dust["1,1"].walnut ?? 0) > 0);
  });

  it("sheds dust in proportion to the stock being cut", () => {
    const at = (shop: ShopDriver) => {
      shop.tick();
      return cellDust(shop.dustLayer.map, [1, 1]);
    };
    const wide = at(planingShop({}, board("walnut", 48, 8, 4)));
    const narrow = at(planingShop({}, board("walnut", 48, 2, 4)));
    const reference = at(planingShop());
    assert.ok(
      wide > reference,
      "a wide board should shed more dust than the reference",
    );
    assert.ok(
      narrow < reference,
      "a narrow board should shed less dust than the reference",
    );
  });

  it("accumulates across ticks", () => {
    const shop = planingShop();
    shop.tick(5);
    assert.ok(Math.abs(cellDust(shop.dustLayer.map, [1, 1]) - 2) < 1e-9);
  });

  it("power feed keeps cutting (and shedding dust) with the player away", () => {
    // The planer's feed rollers don't care where the player stands
    const shop = planingShop().standAt([0, 0]);
    shop.tick();
    assert.ok(cellDust(shop.dustLayer.map, [1, 1]) > 0);
    assert.strictEqual(
      shop.machine("lunchboxPlaner").state.operationProgress.ticksRemaining,
      4,
    );
  });

  it("attended work makes no dust while the player is elsewhere", () => {
    // The jointer has no power feed: stepping away pauses cut and dust
    const shop = jointingShop().standAt([0, 0]);
    shop.tick();
    assert.deepStrictEqual(shop.dustLayer.map, {});
    assert.strictEqual(
      shop.machine("jointer").state.operationProgress.ticksRemaining,
      5,
    );
  });

  it("hand-fed work makes dust only while the player is feeding it", () => {
    // The jointer at [1,1] shares the planer's operation cell, [1,3]
    const feeding = jointingShop().holdOperate(true);
    feeding.tick();
    assert.ok(cellDust(feeding.dustLayer.map, [1, 1]) > 0);
    assert.strictEqual(
      feeding.machine("jointer").state.operationProgress.ticksRemaining,
      4,
    );

    // Let go of the operate key and the cut — and its sawdust — stops
    const released = jointingShop().holdOperate(false);
    released.tick();
    assert.deepStrictEqual(released.dustLayer.map, {});
    assert.strictEqual(
      released.machine("jointer").state.operationProgress.ticksRemaining,
      5,
    );
  });

  it("pauses the cut (and its dust) while the machine is switched off", () => {
    const shop = planingShop();
    toggleMachinePower(shop.game, shop.machine("lunchboxPlaner"));
    shop.tick();
    assert.strictEqual(
      shop.machine("lunchboxPlaner").state.operationProgress.ticksRemaining,
      5,
    );
    assert.deepStrictEqual(shop.dustLayer.map, {});
  });

  it("emits nothing for operations without a dustOutput", () => {
    // The oil soak: dustless, hands-free, tick-driven
    const shop = new ShopDriver({
      state: shopState({
        machines: [
          workspaceMachine({
            selectedOperationId: "oilCuttingBoard",
            processingMaterials: [rawCuttingBoard()],
            operationProgress: {
              status: "inProgress",
              phaseIndex: 1,
              ticksRemaining: 3,
            },
          }),
        ],
      }),
    });
    shop.standAt(WORKSPACE_OPERATION_CELL).holdOperate(true).tick();
    assert.strictEqual(
      shop.machine("workspace").state.operationProgress.ticksRemaining,
      2,
    );
    assert.deepStrictEqual(shop.dustLayer.map, {});
  });

  it("leaves the dust map alone on a dustless tick", () => {
    const shop = new ShopDriver({
      state: shopState({ dust: { "0,0": { pine: 1 } } }),
    });
    const before = shop.dustLayer.map;
    shop.tick();
    assert.strictEqual(shop.dustLayer.map, before);
  });

  it("a mounted dust bag catches most of the emission at the port", () => {
    const shop = planingShop();
    const planer = shop.machine("lunchboxPlaner");
    planer.state = { ...planer.state, tools: ["dustBag"] };
    shop.tick();
    // Planer emits 4/tick bare; the bag captures 60%, so 1.6 lands —
    // 70% split over the seven core cells, 30% over the eleven ring cells
    const dust = shop.dustLayer.map;
    assert.ok(Math.abs(cellDust(dust, [1, 1]) - 0.16) < 1e-9);
    assert.ok(Math.abs(cellDust(dust, [0, 1]) - 0.48 / 11) < 1e-9);
  });
});
