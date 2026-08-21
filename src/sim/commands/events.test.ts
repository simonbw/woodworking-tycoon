import assert from "node:assert";
import { describe, it } from "node:test";
import { BaseEntity } from "../../core/entity/BaseEntity";
import { GameEventMap } from "../../core/entity/Entity";
import { on } from "../../core/entity/handler";
import { board } from "../../game/board-helpers";
import { GameState } from "../../game/GameState";
import { initialGameState } from "../../game/initialGameState";
import { MachineState } from "../../game/Machine";
import { Vector } from "../../game/Vectors";
import { ShopDriver } from "../driver/ShopDriver";
import { MachineEntity } from "../entities/MachineEntity";
import { grantXp } from "../systems/grants";
import { pickUpBroom } from "./cleaning-commands";
import {
  moveMaterialsToMachine,
  pickUpMachine,
  putDownCarriedMachine,
} from "./machine-commands";
import { dropMaterial, pickUpMaterial } from "./pile-commands";
import { takeFromStand } from "./stand-commands";
import { buyMaterial } from "./store-commands";
import { loadTruckBed } from "./truck-commands";

/**
 * The announce contract (issue #230, phase 1): a mutation lands, and the
 * command (or pass) that landed it dispatches the matching domain event —
 * a past-tense fact any entity can hear through the ordinary handler
 * seam. A refusal announces nothing. These cover one representative
 * mutation per event, not every dispatch site; the events themselves are
 * defined in `src/config/CustomEvent.ts`.
 */

/** The workspace bench at [1,2] rotation 0 — operator cell [1,4]. */
const WORKSPACE_OPERATION_CELL: Vector = [1, 4];
/** The saw at [1,1] rotation 0 — operator cell [1,3]. */
const SAW_OPERATION_CELL: Vector = [1, 3];

function shopState(overrides: Partial<GameState> = {}): GameState {
  return { ...initialGameState, ...overrides };
}

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

/** A saw mid-cut, the shape the minute pass advances. */
function sawMachine(): MachineState {
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
  };
}

/** Hears every domain event through the real handler seam. */
class EventRecorder extends BaseEntity {
  pausable = false;
  readonly heard: Array<{ name: string; machine?: MachineEntity }> = [];

  @on("machineAdded")
  onMachineAdded({ machine }: GameEventMap["machineAdded"]) {
    this.heard.push({ name: "machineAdded", machine });
  }
  @on("machineRemoved")
  onMachineRemoved({ machine }: GameEventMap["machineRemoved"]) {
    this.heard.push({ name: "machineRemoved", machine });
  }
  @on("machineStateChanged")
  onMachineStateChanged({ machine }: GameEventMap["machineStateChanged"]) {
    this.heard.push({ name: "machineStateChanged", machine });
  }
  @on("pilesChanged")
  onPilesChanged() {
    this.heard.push({ name: "pilesChanged" });
  }
  @on("cratesChanged")
  onCratesChanged() {
    this.heard.push({ name: "cratesChanged" });
  }
  @on("playerChanged")
  onPlayerChanged() {
    this.heard.push({ name: "playerChanged" });
  }
  @on("truckChanged")
  onTruckChanged() {
    this.heard.push({ name: "truckChanged" });
  }
  @on("standChanged")
  onStandChanged() {
    this.heard.push({ name: "standChanged" });
  }
  @on("suppliesChanged")
  onSuppliesChanged() {
    this.heard.push({ name: "suppliesChanged" });
  }
  @on("cleaningChanged")
  onCleaningChanged() {
    this.heard.push({ name: "cleaningChanged" });
  }
  @on("progressionChanged")
  onProgressionChanged() {
    this.heard.push({ name: "progressionChanged" });
  }

  names(): string[] {
    return this.heard.map((event) => event.name);
  }
}

function listen(shop: ShopDriver): EventRecorder {
  return shop.game.addEntity(new EventRecorder());
}

describe("commands announce their mutations", () => {
  it("setting the carried machine down announces machineAdded and the changed hands", () => {
    const shop = new ShopDriver({
      state: shopState({
        machines: [],
        player: {
          ...initialGameState.player,
          carriedMachine: workspaceMachine(),
        },
      }),
    }).standAt([5, 5]);
    const recorder = listen(shop);
    assert.ok(putDownCarriedMachine(shop.game));
    const added = recorder.heard.find(
      (event) => event.name === "machineAdded",
    );
    assert.ok(added, "no machineAdded heard");
    assert.strictEqual(added.machine?.state.machineTypeId, "workspace");
    assert.ok(recorder.names().includes("playerChanged"));
  });

  it("hoisting a machine announces machineRemoved carrying its last state", () => {
    const shop = new ShopDriver({
      state: shopState({ machines: [workspaceMachine()] }),
    }).standAt(WORKSPACE_OPERATION_CELL);
    const entity = shop.machine("workspace");
    const recorder = listen(shop);
    assert.ok(pickUpMachine(shop.game, entity));
    const removed = recorder.heard.find(
      (event) => event.name === "machineRemoved",
    );
    assert.strictEqual(removed?.machine, entity);
    assert.ok(recorder.names().includes("playerChanged"));
  });

  it("staging stock announces the machine's new state and the emptier hands", () => {
    const shop = new ShopDriver({
      state: shopState({
        machines: [workspaceMachine()],
        player: {
          ...initialGameState.player,
          inventory: [board("maple", 24, 4, 2)],
        },
      }),
    }).standAt(WORKSPACE_OPERATION_CELL);
    const entity = shop.machine("workspace");
    const recorder = listen(shop);
    assert.ok(moveMaterialsToMachine(shop.game, [shop.inventory[0]], entity));
    const changed = recorder.heard.find(
      (event) => event.name === "machineStateChanged",
    );
    assert.strictEqual(changed?.machine, entity);
    assert.ok(recorder.names().includes("playerChanged"));
  });

  it("a refused command announces nothing", () => {
    const shop = new ShopDriver({
      state: shopState({ machines: [workspaceMachine()] }),
    }).standAt(WORKSPACE_OPERATION_CELL);
    const entity = shop.machine("workspace");
    const recorder = listen(shop);
    // A board minted here was never in the player's hands.
    assert.strictEqual(
      moveMaterialsToMachine(shop.game, [board("maple", 24, 4, 2)], entity),
      false,
    );
    assert.deepStrictEqual(recorder.names(), []);
  });

  it("floor stock announces pilesChanged both dropping and picking up", () => {
    const shop = new ShopDriver({
      state: shopState({
        player: {
          ...initialGameState.player,
          inventory: [board("maple", 24, 4, 2)],
        },
      }),
    }).standAt([4, 4]);
    const recorder = listen(shop);
    assert.ok(dropMaterial(shop.game, [shop.inventory[0]]));
    assert.ok(recorder.names().includes("pilesChanged"));
    assert.ok(recorder.names().includes("playerChanged"));

    recorder.heard.length = 0;
    assert.ok(pickUpMaterial(shop.game, [shop.piles[0]]));
    assert.ok(recorder.names().includes("pilesChanged"));
    assert.ok(recorder.names().includes("playerChanged"));
  });

  it("loading the truck's bed announces truckChanged", () => {
    const shop = new ShopDriver({
      state: shopState({
        player: {
          ...initialGameState.player,
          inventory: [board("maple", 24, 4, 2)],
        },
      }),
    }).standAtBed();
    const recorder = listen(shop);
    assert.ok(loadTruckBed(shop.game, [shop.inventory[0]]));
    assert.ok(recorder.names().includes("truckChanged"));
    assert.ok(recorder.names().includes("playerChanged"));
  });

  it("taking a piece back off the stand announces standChanged", () => {
    const shop = new ShopDriver({
      state: shopState({
        stand: [board("maple", 24, 4, 2, "sanded")],
      }),
    }).standAtStand();
    const recorder = listen(shop);
    assert.ok(takeFromStand(shop.game, 1));
    assert.ok(recorder.names().includes("standChanged"));
    assert.ok(recorder.names().includes("playerChanged"));
  });

  it("a purchase announces the money spent and the goods in the bed", () => {
    const shop = new ShopDriver({ state: shopState({ money: 100 }) });
    const recorder = listen(shop);
    assert.ok(buyMaterial(shop.game, board("maple", 24, 4, 2), 10));
    assert.ok(recorder.names().includes("progressionChanged"));
    assert.ok(recorder.names().includes("truckChanged"));
  });

  it("an unaffordable purchase announces nothing", () => {
    const shop = new ShopDriver({ state: shopState({ money: 0 }) });
    const recorder = listen(shop);
    assert.strictEqual(
      buyMaterial(shop.game, board("maple", 24, 4, 2), 10),
      false,
    );
    assert.deepStrictEqual(recorder.names(), []);
  });

  it("picking up the broom announces cleaningChanged", () => {
    const shop = new ShopDriver({
      state: shopState({ broomOwned: true, broomPosition: [4, 4] }),
    }).standAt([4, 4]);
    const recorder = listen(shop);
    assert.ok(pickUpBroom(shop.game));
    assert.ok(recorder.names().includes("cleaningChanged"));
  });

  it("granting xp announces progressionChanged", () => {
    const shop = new ShopDriver({ state: shopState() });
    const recorder = listen(shop);
    grantXp(shop.game, 10);
    assert.deepStrictEqual(recorder.names(), ["progressionChanged"]);
  });
});

describe("the passes announce their mutations", () => {
  it("the machine minute announces machineStateChanged as the cut advances", () => {
    const shop = new ShopDriver({
      state: shopState({ machines: [sawMachine()] }),
    })
      .standAt(SAW_OPERATION_CELL)
      .holdOperate(true);
    const entity = shop.machine("miterSaw");
    const recorder = listen(shop);
    shop.tick();
    const changed = recorder.heard.find(
      (event) => event.name === "machineStateChanged",
    );
    assert.strictEqual(changed?.machine, entity);
  });

  it("a paused minute announces nothing for an unattended machine", () => {
    const shop = new ShopDriver({
      state: shopState({ machines: [sawMachine()] }),
    }).standAt([8, 8]);
    const recorder = listen(shop);
    shop.tick();
    assert.ok(!recorder.names().includes("machineStateChanged"));
  });
});
