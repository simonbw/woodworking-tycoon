import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "../board-helpers";
import { freshMachineState } from "./machine-actions";
import { GameState, JobOffer, MarketListing } from "../GameState";
import { initialGameState } from "../initialGameState";
import { truckCabSideCell } from "../lot";
import { generateJobBoard } from "../job-generation";
import { JOB_OFFER_LIFETIME_TICKS, LISTING_PITY_TICKS } from "../marketplace";
import { makeMaterial } from "../material-helpers";
import { HAND_CAPACITY } from "../Person";
import { getSellValue } from "../material-values";
import { materialMeetsInput } from "../material-helpers";
import { FinishedProduct, MaterialInstance } from "../Materials";
import { TICKS_PER_DAY } from "../time";
import {
  acceptJobAction,
  cancelJobAction,
  delistItemAction,
  deliverJobAction,
  listItemsAction,
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
  // At the truck's cab by default — that's the only place work can be
  // delivered (see delivery.ts). Deliverables go through the bed; the
  // listing tests keep using the hands.
  return {
    ...base,
    player: {
      ...base.player,
      inventory,
      position: truckCabSideCell(base.shopInfo),
    },
  };
}

function listedState(
  askingPrice: number,
  overrides: Partial<GameState> = {},
): { state: GameState; listing: MarketListing } {
  const shelf = makeShelf();
  const state = listItemsAction(
    [shelf],
    askingPrice,
  )(stateWith(overrides, [shelf]));
  return { state, listing: state.listings[0] };
}

describe("listItemsAction", () => {
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
    const result = listItemsAction([shelf], 75)(state);
    assert.strictEqual(result, state);
  });

  it("rejects items not in the inventory and non-positive prices", () => {
    const state = stateWith({}, []);
    assert.strictEqual(listItemsAction([makeShelf()], 75)(state), state);

    const shelf = makeShelf();
    const withItem = stateWith({}, [shelf]);
    assert.strictEqual(listItemsAction([shelf], 0)(withItem), withItem);
  });

  it("puts identical pieces up as one stacked offer", () => {
    const shelves = [makeShelf(), makeShelf(), makeShelf()];
    const state = listItemsAction(shelves, 20)(stateWith({}, shelves));
    assert.strictEqual(state.listings.length, 1);
    assert.deepStrictEqual(state.listings[0].materials, shelves);
    assert.deepStrictEqual(state.player.inventory, []);
  });

  it("adds to a standing offer at the same price without restarting its clock", () => {
    const first = makeShelf();
    const listed = listItemsAction([first], 20)(stateWith({}, [first]));

    const second = makeShelf();
    const later = {
      ...listed,
      tick: listed.tick + 500,
      player: { ...listed.player, inventory: [second] },
    };
    const result = listItemsAction([second], 20)(later);

    assert.strictEqual(result.listings.length, 1);
    assert.deepStrictEqual(result.listings[0].materials, [first, second]);
    // The offer has been standing since the first piece went up
    assert.strictEqual(result.listings[0].listedAtTick, listed.tick);
  });

  it("keeps a differently priced offer of the same thing separate", () => {
    const first = makeShelf();
    const listed = listItemsAction([first], 20)(stateWith({}, [first]));

    const second = makeShelf();
    const result = listItemsAction(
      [second],
      30,
    )({
      ...listed,
      player: { ...listed.player, inventory: [second] },
    });
    assert.strictEqual(result.listings.length, 2);
  });

  it("refuses to stack pieces that aren't the same offer", () => {
    const shelf = makeShelf();
    const birdhouse = makeMaterial<FinishedProduct>({
      type: "birdhouse",
      species: "pallet",
    });
    const state = stateWith({}, [shelf, birdhouse]);
    assert.strictEqual(listItemsAction([shelf, birdhouse], 20)(state), state);
  });

  it("refuses raw stock — build something out of it or bin it", () => {
    const plank = board("pallet", 36);
    const state = stateWith({}, [plank]);
    assert.strictEqual(listItemsAction([plank], 5)(state), state);
  });

  it("refuses raw stock riding along with a product", () => {
    const shelf = makeShelf();
    const plank = board("pallet", 36);
    const state = stateWith({}, [shelf, plank]);
    assert.strictEqual(listItemsAction([shelf, plank], 20)(state), state);
    // ...and the product on its own still goes up
    assert.strictEqual(listItemsAction([shelf], 20)(state).listings.length, 1);
  });
});

describe("delistItemAction", () => {
  it("returns the item to the inventory", () => {
    const { state, listing } = listedState(75);
    const result = delistItemAction(listing.id)(state);
    assert.deepStrictEqual(result.listings, []);
    assert.deepStrictEqual(result.player.inventory, listing.materials);
  });

  it("refuses when the hands are already full", () => {
    // Full arms — the delisted item has nowhere to go
    const { state, listing } = listedState(75);
    const fullHanded = {
      ...state,
      player: {
        ...state.player,
        inventory: Array.from({ length: HAND_CAPACITY }, () => makeShelf()),
      },
    };
    const result = delistItemAction(listing.id)(fullHanded);
    assert.strictEqual(result.listings.length, 1);
    assert.strictEqual(result.player.inventory.length, HAND_CAPACITY);
    assert.strictEqual(listing.id, result.listings[0].id);
  });

  it("takes pieces off a stack and leaves the rest up", () => {
    const shelves = [makeShelf(), makeShelf(), makeShelf()];
    const state = listItemsAction(shelves, 20)(stateWith({}, shelves));
    const result = delistItemAction(state.listings[0].id, 2)(state);
    assert.strictEqual(result.listings.length, 1);
    assert.deepStrictEqual(result.listings[0].materials, [shelves[2]]);
    assert.deepStrictEqual(result.player.inventory, [shelves[0], shelves[1]]);
  });

  it("takes back no more than the arms can hold", () => {
    const shelves = Array.from({ length: HAND_CAPACITY + 2 }, makeShelf);
    const state = listItemsAction(shelves, 20)(stateWith({}, shelves));
    const result = delistItemAction(
      state.listings[0].id,
      shelves.length,
    )(state);
    assert.strictEqual(result.player.inventory.length, HAND_CAPACITY);
    assert.strictEqual(result.listings[0].materials.length, 2);
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

  it("merges into a standing offer when repriced onto its price", () => {
    const cheap = makeShelf();
    const dear = makeShelf();
    const state = listItemsAction(
      [dear],
      30,
    )(listItemsAction([cheap], 20)(stateWith({}, [cheap, dear])));
    assert.strictEqual(state.listings.length, 2);

    const result = repriceListingAction(state.listings[1].id, 20)(state);
    assert.strictEqual(result.listings.length, 1);
    assert.strictEqual(result.listings[0].id, state.listings[0].id);
    assert.deepStrictEqual(result.listings[0].materials, [cheap, dear]);
  });
});

describe("marketplaceTickPass listings", () => {
  it("pays out, removes the listing, and cues a sale when the roll hits", () => {
    // Asked slightly over the shelf's ~$12 fair value: still sellable, and
    // close enough to fair that the buyer's review rounds above zero
    const { state, listing } = listedState(15);
    const result = marketplaceTickPass(alwaysRng)(state);
    assert.deepStrictEqual(result.listings, []);
    assert.strictEqual(result.money, state.money + 15);
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

  it("sells a stack a piece at a time, dipping demand for each sale", () => {
    const shelves = [makeShelf(), makeShelf(), makeShelf()];
    // A single roll that hits, then misses: only the first piece finds a
    // buyer this tick, and the offer stays up with the other two.
    let rolls = 0;
    const onceRng = () => (rolls++ === 0 ? 0 : 0.999999);
    const state = listItemsAction(shelves, 15)(stateWith({}, shelves));
    const result = marketplaceTickPass(onceRng)(state);

    assert.strictEqual(result.listings.length, 1);
    assert.deepStrictEqual(result.listings[0].materials, [
      shelves[1],
      shelves[2],
    ]);
    assert.strictEqual(result.money, state.money + 15);
    assert.ok((result.categoryDemand.rusticShelf ?? 1) < 1);
  });

  it("pity-sells a whole fairly priced stack once the window passes", () => {
    const shelves = [makeShelf(), makeShelf(), makeShelf()];
    const fairValue = getSellValue(shelves[0]);
    const state = listItemsAction(shelves, fairValue)(stateWith({}, shelves));
    const later = { ...state, tick: state.tick + LISTING_PITY_TICKS };
    const result = marketplaceTickPass(neverRng)(later);
    assert.deepStrictEqual(result.listings, []);
    assert.strictEqual(result.money, state.money + fairValue * 3);
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

  it("rotates expired offers out on a morning it hasn't seen", () => {
    const seeded = marketplaceTickPass(neverRng)(stateWith({}));
    // A new morning (the day turned over by sleeping) with every offer
    // past its lifetime.
    const newMorning = {
      ...seeded,
      tick: seeded.tick + JOB_OFFER_LIFETIME_TICKS + 1,
      day: seeded.day + 1,
    };
    const result = marketplaceTickPass(neverRng)(newMorning);
    assert.ok(result.jobBoard.length >= 3);
    for (const offer of result.jobBoard) {
      assert.strictEqual(offer.postedAtTick, newMorning.tick);
    }
    assert.strictEqual(result.jobBoardDay, newMorning.day);
  });

  it("keeps a full board unrotated until the day turns over", () => {
    const seeded = marketplaceTickPass(neverRng)(stateWith({}));
    // Ticks alone — even a lot of them — don't make a new morning.
    const laterSameDay = { ...seeded, tick: seeded.tick + TICKS_PER_DAY };
    const result = marketplaceTickPass(neverRng)(laterSameDay);
    assert.deepStrictEqual(result.jobBoard, seeded.jobBoard);
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

  it("adds machine-gated work once the shop can build it", () => {
    // New gear brings work as the product it makes, not as an errand:
    // the saw, the rip fence, and a sanding block together are what the
    // rustic frame needs, so the frame job appears with the third one.
    const starterShop = stateWith({
      machineCrates: [
        {
          machine: freshMachineState("miterSaw", initialGameState.progression),
          position: [2, 5],
        },
        {
          machine: freshMachineState(
            "jobsiteTableSaw",
            initialGameState.progression,
          ),
          position: [4, 5],
        },
      ],
    });
    let calls = 0;
    const rng = () => {
      // Cheap deterministic pseudo-rng
      calls++;
      return (calls * 0.6180339887) % 1;
    };
    const countFrameJobs = (state: GameState) => {
      let found = 0;
      for (let i = 0; i < 30; i++) {
        for (const offer of generateJobBoard(state, rng)) {
          if (
            offer.requiredMaterials.some((r) =>
              r.type?.includes("rusticFrame" as never),
            )
          ) {
            found++;
          }
        }
      }
      return found;
    };

    // Saws but nothing to sand with: the frame is still out of reach
    assert.strictEqual(
      countFrameJobs(starterShop),
      0,
      "no frame work before the shop can sand",
    );

    const withSander: GameState = {
      ...starterShop,
      player: {
        ...starterShop.player,
        inventory: [
          ...starterShop.player.inventory,
          { id: "block-1", type: "tool", toolId: "sandingBlock" },
        ],
      },
    };
    assert.ok(countFrameJobs(withSander) > 0, "expected some frame jobs");
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

  it("delivering consumes the bed's materials and pays base + tip", () => {
    const shelf = makeShelf();
    const accepted = { ...shelfOffer, acceptedAtTick: 0 };
    const base = stateWith({ tick: 0, acceptedJobs: [accepted] });
    const state = { ...base, truck: { ...base.truck, bed: [shelf] } };
    const result = deliverJobAction("job-test")(state);
    assert.deepStrictEqual(result.acceptedJobs, []);
    assert.deepStrictEqual(result.truck.bed, []);
    // Full tip at instant delivery: 100 * 1.4
    assert.strictEqual(result.money, state.money + 140);
    assert.strictEqual(result.reputation, state.reputation + 4);
    assert.ok(result.progression.xp > 0);
  });

  it("does nothing when the bed is empty", () => {
    const accepted = { ...shelfOffer, acceptedAtTick: 0 };
    const state = stateWith({ acceptedJobs: [accepted] }, []);
    const result = deliverJobAction("job-test")(state);
    assert.strictEqual(result, state);
  });

  it("generated pallet jobs are satisfiable by pallet deck boards", () => {
    // The zero-cost guarantee is only real if scavenged deck boards
    // actually match the generated requirement
    const offers = generateJobBoard(stateWith({}), neverRng);
    const deckBoard = board("pallet", 36, 4, 2);
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
