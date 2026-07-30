import assert from "node:assert";
import { describe, it } from "node:test";
import { COMMISSION_SEQUENCE } from "./commissionSequence";
import {
  canHandOff,
  consumeRequiredMaterials,
  hasRequiredMaterials,
  readyHandoffs,
} from "./delivery";
import { freshMachineState } from "./game-actions/machine-actions";
import { AcceptedJob, GameState } from "./GameState";
import { initialGameState } from "./initialGameState";
import { truckCabSideCell } from "./lot";
import { MaterialInstance, FinishedProduct } from "./Materials";
import { makeMaterial } from "./material-helpers";

function shelf(): FinishedProduct {
  return makeMaterial<FinishedProduct>({
    type: "rusticShelf",
    species: "pallet",
  });
}

/** At the truck's cab, hands free, with `bed` loaded in the truck. */
function atCab(
  bed: ReadonlyArray<MaterialInstance> = [],
  overrides: Partial<GameState> = {},
): GameState {
  const base = { ...initialGameState, ...overrides };
  return {
    ...base,
    truck: { ...base.truck, bed },
    player: {
      ...base.player,
      position: truckCabSideCell(base.shopInfo),
    },
  };
}

function jobFor(
  requiredMaterials: AcceptedJob["requiredMaterials"],
): AcceptedJob {
  return {
    id: "job-1",
    name: "A Customer",
    description: "Wants a shelf.",
    requiredMaterials,
    basePay: 100,
    baseReputation: 1,
    postedAtTick: 0,
    materialCostFree: true,
    acceptedAtTick: 0,
  };
}

describe("consumeRequiredMaterials", () => {
  it("returns the inventory minus exactly what the order asks for", () => {
    const spare = shelf();
    const result = consumeRequiredMaterials(
      [shelf(), spare],
      [{ type: ["rusticShelf"], species: ["pallet"], quantity: 1 }],
    );
    assert.deepStrictEqual(result, [spare]);
  });

  it("returns null when the player is short", () => {
    const result = consumeRequiredMaterials(
      [shelf()],
      [{ type: ["rusticShelf"], species: ["pallet"], quantity: 2 }],
    );
    assert.strictEqual(result, null);
  });

  it("never counts one item toward two requirements", () => {
    // A single shelf can satisfy either line on its own, but not both.
    const result = consumeRequiredMaterials(
      [shelf()],
      [
        { type: ["rusticShelf"], species: ["pallet"], quantity: 1 },
        { type: ["rusticShelf"], species: ["pallet"], quantity: 1 },
      ],
    );
    assert.strictEqual(result, null);
  });

  it("leaves the inventory untouched for an empty order", () => {
    const held = [shelf()];
    assert.deepStrictEqual(consumeRequiredMaterials(held, []), held);
  });
});

describe("hasRequiredMaterials", () => {
  it("agrees with the consume it wraps", () => {
    const requirement = [
      {
        type: ["rusticShelf"] as const,
        species: ["pallet"] as const,
        quantity: 1,
      },
    ];
    assert.strictEqual(hasRequiredMaterials([shelf()], requirement), true);
    assert.strictEqual(hasRequiredMaterials([], requirement), false);
  });
});

describe("canHandOff", () => {
  it("is true at the truck's cab with free hands", () => {
    assert.strictEqual(canHandOff(atCab()), true);
  });

  it("is false away from the cab", () => {
    const state = atCab();
    const inTheMiddle = {
      ...state,
      player: { ...state.player, position: [1, 1] as [number, number] },
    };
    assert.strictEqual(canHandOff(inTheMiddle), false);
  });

  it("is false with a machine over your shoulders", () => {
    const state = atCab();
    const carrying: GameState = {
      ...state,
      player: {
        ...state.player,
        carriedMachine: freshMachineState("workspace", state.progression),
      },
    };
    assert.strictEqual(canHandOff(carrying), false);
  });

  it("is false while out of the shop", () => {
    const state = atCab();
    const away = {
      ...state,
      player: {
        ...state.player,
        away: { kind: "shopping" as const, store: "orangeBox" as const },
      },
    };
    assert.strictEqual(canHandOff(away), false);
  });
});

describe("readyHandoffs", () => {
  it("lists the active commission once its deliverables are loaded", () => {
    const handoffs = readyHandoffs(atCab([shelf()]));
    assert.strictEqual(handoffs.length, 1);
    assert.strictEqual(handoffs[0].kind, "commission");
    assert.strictEqual(
      handoffs[0].kind === "commission" && handoffs[0].commission.id,
      COMMISSION_SEQUENCE[0].id,
    );
  });

  it("lists nothing while the bed is empty", () => {
    assert.deepStrictEqual(readyHandoffs(atCab([])), []);
  });

  it("lists nothing away from the cab, however full the bed is", () => {
    const state = atCab([shelf()]);
    const inTheMiddle = {
      ...state,
      player: { ...state.player, position: [1, 1] as [number, number] },
    };
    assert.deepStrictEqual(readyHandoffs(inTheMiddle), []);
  });

  it("lists a ready accepted job alongside the commission", () => {
    const job = jobFor([
      { type: ["rusticShelf"], species: ["pallet"], quantity: 1 },
    ]);
    // Two shelves: one for the commission, one for the job.
    const handoffs = readyHandoffs(
      atCab([shelf(), shelf()], { acceptedJobs: [job] }),
    );
    assert.deepStrictEqual(
      handoffs.map((handoff) => handoff.kind),
      ["commission", "job"],
    );
  });

  it("omits an accepted job the bed can't fulfil yet", () => {
    const job = jobFor([
      { type: ["pictureFrame"], species: ["oak"], quantity: 1 },
    ]);
    const handoffs = readyHandoffs(atCab([shelf()], { acceptedJobs: [job] }));
    assert.deepStrictEqual(
      handoffs.map((handoff) => handoff.kind),
      ["commission"],
    );
  });
});
