import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "../board-helpers";
import { freshMachineState } from "./machine-actions";
import { GameState, JobOffer, MarketListing } from "../GameState";
import { initialGameState } from "../initialGameState";
import { generateJobBoard } from "../job-generation";
import { JOB_OFFER_LIFETIME_TICKS, LISTING_PITY_TICKS } from "../marketplace";
import { makeMaterial } from "../material-helpers";
import { getSellValue } from "../material-values";
import { materialMeetsInput } from "../material-helpers";
import { FinishedProduct, MaterialInstance } from "../Materials";
import { TICKS_PER_DAY } from "../time";
import {
  acceptJobAction,
  cancelJobAction,
  delistItemAction,
  deliverJobAction,
  listItemAction,
  marketplaceTickPass,
  repriceListingAction,
} from "./marketplace-actions";

/** rng that never triggers probabilistic events. */
const neverRng = () => 0.999999;
/** rng that always triggers them. */
const alwaysRng = () => 0;

function makeShelf(): FinishedProduct {
  return makeMaterial<FinishedProduct>({
    type: "rusticShelf",
    species: "pallet",
  });
}

function stateWith(
  overrides: Partial<GameState>,
  inventory: ReadonlyArray<MaterialInstance> = [],
): GameState {
  const base: GameState = {
    ...initialGameState,
    progression: {
      ...initialGameState.progression,
      marketplaceUnlocked: true,
      commissionsCompleted: 2,
    },
    ...overrides,
  };
  return { ...base, player: { ...base.player, inventory } };
}

function listedState(
  askingPrice: number,
  overrides: Partial<GameState> = {},
): { state: GameState; listing: MarketListing } {
  const shelf = makeShelf();
  const state = listItemAction(
    shelf,
    askingPrice,
  )(stateWith(overrides, [shelf]));
  return { state, listing: state.listings[0] };
}

describe("listItemAction", () => {
  it("moves the item from inventory to a listing at the asking price", () => {
    const { state, listing } = listedState(75);
    assert.deepStrictEqual(state.player.inventory, []);
    assert.strictEqual(state.listings.length, 1);
    assert.strictEqual(listing.askingPrice, 75);
    assert.strictEqual(listing.listedAtTick, state.tick);
  });

  it("does nothing before the marketplace unlocks", () => {
    const shelf = makeShelf();
    const state = {
      ...stateWith({}, [shelf]),
      progression: {
        ...initialGameState.progression,
        marketplaceUnlocked: false,
      },
    };
    const result = listItemAction(shelf, 75)(state);
    assert.strictEqual(result, state);
  });

  it("rejects items not in the inventory and non-positive prices", () => {
    const state = stateWith({}, []);
    assert.strictEqual(listItemAction(makeShelf(), 75)(state), state);

    const shelf = makeShelf();
    const withItem = stateWith({}, [shelf]);
    assert.strictEqual(listItemAction(shelf, 0)(withItem), withItem);
  });
});

describe("delistItemAction", () => {
  it("returns the item to the inventory", () => {
    const { state, listing } = listedState(75);
    const result = delistItemAction(listing.id)(state);
    assert.deepStrictEqual(result.listings, []);
    assert.deepStrictEqual(result.player.inventory, [listing.material]);
  });
});

describe("repriceListingAction", () => {
  it("changes the price and restarts the listing clock", () => {
    const { state, listing } = listedState(75);
    const later = { ...state, tick: 500 };
    const result = repriceListingAction(listing.id, 60)(later);
    assert.strictEqual(result.listings[0].askingPrice, 60);
    assert.strictEqual(result.listings[0].listedAtTick, 500);
  });
});

describe("marketplaceTickPass listings", () => {
  it("pays out, removes the listing, and cues a sale when the roll hits", () => {
    const { state, listing } = listedState(75);
    const result = marketplaceTickPass(alwaysRng)(state);
    assert.deepStrictEqual(result.listings, []);
    assert.strictEqual(result.money, state.money + 75);
    assert.ok(
      result.pendingSounds?.some((event) => event.kind === "sale"),
      "expected a sale sound cue",
    );
    // The buyer leaves a review — a small reputation trickle
    assert.ok(result.reputation > state.reputation);
    // The category demand meter dips
    const category = "rusticShelf";
    assert.ok((result.categoryDemand[category] ?? 1) < 1);
    assert.ok(listing.askingPrice > 0);
  });

  it("leaves the listing up when the roll misses", () => {
    const { state } = listedState(75);
    const result = marketplaceTickPass(neverRng)(state);
    assert.strictEqual(result.listings.length, 1);
    assert.strictEqual(result.money, state.money);
  });

  it("pity-sells a fairly priced listing after two days", () => {
    const shelf = makeShelf();
    const fairValue = getSellValue(shelf);
    const { state } = listedState(fairValue);
    const later = { ...state, tick: state.tick + LISTING_PITY_TICKS };
    const result = marketplaceTickPass(neverRng)(later);
    assert.deepStrictEqual(result.listings, []);
    assert.strictEqual(result.money, state.money + fairValue);
  });

  it("never pity-sells an overpriced listing", () => {
    const shelf = makeShelf();
    const { state } = listedState(getSellValue(shelf) * 3);
    const later = { ...state, tick: state.tick + LISTING_PITY_TICKS * 5 };
    const result = marketplaceTickPass(neverRng)(later);
    assert.strictEqual(result.listings.length, 1);
  });

  it("recovers demand meters over time and drops them when full", () => {
    const state = stateWith({ categoryDemand: { rusticShelf: 0.5 } });
    const result = marketplaceTickPass(neverRng)(state);
    assert.ok(result.categoryDemand.rusticShelf > 0.5);

    const nearlyFull = stateWith({ categoryDemand: { rusticShelf: 0.9999 } });
    const recovered = marketplaceTickPass(neverRng)(nearlyFull);
    assert.strictEqual(recovered.categoryDemand.rusticShelf, undefined);
  });
});

describe("marketplaceTickPass job board", () => {
  it("fills an empty board once the marketplace is unlocked", () => {
    const state = stateWith({});
    const result = marketplaceTickPass(neverRng)(state);
    assert.ok(result.jobBoard.length >= 3);
  });

  it("keeps the board empty before the marketplace unlocks", () => {
    const result = marketplaceTickPass(neverRng)(initialGameState);
    assert.deepStrictEqual(result.jobBoard, []);
  });

  it("rotates expired offers out at the day boundary", () => {
    const seeded = marketplaceTickPass(neverRng)(stateWith({}));
    const expired = {
      ...seeded,
      tick: seeded.tick + JOB_OFFER_LIFETIME_TICKS + TICKS_PER_DAY,
    };
    // Land exactly on a day boundary
    const atBoundary = {
      ...expired,
      tick: Math.ceil(expired.tick / TICKS_PER_DAY) * TICKS_PER_DAY,
    };
    const result = marketplaceTickPass(neverRng)(atBoundary);
    assert.ok(result.jobBoard.length >= 3);
    for (const offer of result.jobBoard) {
      assert.strictEqual(offer.postedAtTick, atBoundary.tick);
    }
  });

  it("always keeps a material-cost-free job on the board", () => {
    const result = marketplaceTickPass(neverRng)(stateWith({}));
    assert.ok(result.jobBoard.some((offer) => offer.materialCostFree));
  });
});

describe("generateJobBoard", () => {
  it("only offers jobs the player can actually produce", () => {
    // A fresh shop owns no saws, sanders, or planers: every offer must be
    // pallet-tier work
    const board = generateJobBoard(stateWith({}), alwaysRng);
    for (const offer of board) {
      assert.ok(
        offer.materialCostFree,
        `unexpected offer: ${offer.description}`,
      );
    }
  });

  it("adds tool-gated work once the machine is owned", () => {
    const state = stateWith({
      machineCrates: [
        {
          machine: freshMachineState("miterSaw", initialGameState.progression),
          position: [2, 5],
        },
      ],
    });
    // Sample many boards: miter-saw jobs must show up somewhere
    let sawJobs = 0;
    let calls = 0;
    const rng = () => {
      // Cheap deterministic pseudo-rng
      calls++;
      return (calls * 0.6180339887) % 1;
    };
    for (let i = 0; i < 30; i++) {
      for (const offer of generateJobBoard(state, rng)) {
        if (offer.description.includes("crosscut")) {
          sawJobs++;
        }
      }
    }
    assert.ok(sawJobs > 0, "expected some miter saw jobs");
  });
});

describe("accept / cancel / deliver job", () => {
  function offerFor(
    requiredMaterials: JobOffer["requiredMaterials"],
  ): JobOffer {
    return {
      id: "job-test",
      name: "Dana R.",
      description: "Test job",
      requiredMaterials,
      basePay: 100,
      baseReputation: 2,
      postedAtTick: 0,
      materialCostFree: true,
    };
  }

  const shelfOffer = offerFor([
    { type: ["rusticShelf"], species: ["pallet"], quantity: 1 },
  ]);

  it("accepting moves the offer into accepted jobs", () => {
    const state = stateWith({ jobBoard: [shelfOffer] });
    const result = acceptJobAction("job-test")(state);
    assert.deepStrictEqual(result.jobBoard, []);
    assert.strictEqual(result.acceptedJobs.length, 1);
    assert.strictEqual(result.acceptedJobs[0].acceptedAtTick, state.tick);
  });

  it("respects the concurrent job limit", () => {
    const state = stateWith({
      reputation: 0, // one slot
      jobBoard: [shelfOffer],
      acceptedJobs: [{ ...offerFor([]), id: "job-busy", acceptedAtTick: 0 }],
    });
    const result = acceptJobAction("job-test")(state);
    assert.strictEqual(result, state);
  });

  it("cancelling costs reputation but never goes below zero", () => {
    const accepted = { ...shelfOffer, acceptedAtTick: 0 };
    const state = stateWith({ reputation: 5, acceptedJobs: [accepted] });
    const result = cancelJobAction("job-test")(state);
    assert.deepStrictEqual(result.acceptedJobs, []);
    assert.strictEqual(result.reputation, 4);

    const broke = stateWith({ reputation: 0.5, acceptedJobs: [accepted] });
    assert.strictEqual(cancelJobAction("job-test")(broke).reputation, 0);
  });

  it("delivering consumes materials and pays base + tip", () => {
    const shelf = makeShelf();
    const accepted = { ...shelfOffer, acceptedAtTick: 0 };
    const state = stateWith({ tick: 0, acceptedJobs: [accepted] }, [shelf]);
    const result = deliverJobAction("job-test")(state);
    assert.deepStrictEqual(result.acceptedJobs, []);
    assert.deepStrictEqual(result.player.inventory, []);
    // Full tip at instant delivery: 100 * 1.4
    assert.strictEqual(result.money, state.money + 140);
    assert.strictEqual(result.reputation, state.reputation + 4);
    assert.ok(result.progression.xp > 0);
  });

  it("does nothing when the materials are missing", () => {
    const accepted = { ...shelfOffer, acceptedAtTick: 0 };
    const state = stateWith({ acceptedJobs: [accepted] }, []);
    const result = deliverJobAction("job-test")(state);
    assert.strictEqual(result, state);
  });

  it("generated pallet jobs are satisfiable by pallet deck boards", () => {
    // The zero-cost guarantee is only real if scavenged deck boards
    // actually match the generated requirement
    const offers = generateJobBoard(stateWith({}), neverRng);
    const deckBoard = board("pallet", 3, 4, 1);
    const boardJob = offers.find((offer) =>
      offer.requiredMaterials.some((req) =>
        (req.type as readonly string[] | undefined)?.includes("board"),
      ),
    );
    if (boardJob) {
      const req = boardJob.requiredMaterials[0];
      assert.ok(materialMeetsInput(deckBoard, req));
    }
  });
});
