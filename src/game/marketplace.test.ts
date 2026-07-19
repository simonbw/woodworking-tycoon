import assert from "node:assert";
import { describe, it } from "node:test";
import { AcceptedJob, MarketListing } from "./GameState";
import {
  JOB_TIP_DECAY_TICKS,
  JOB_TIP_FRACTION,
  LISTING_PITY_TICKS,
  jobPayout,
  listingPitySale,
  listingSaleChance,
  maxAcceptedJobs,
  priceCurveCenter,
  priceFactor,
  reviewReputationGain,
} from "./marketplace";
import { makeMaterial } from "./material-helpers";
import { getSellValue } from "./material-values";
import { FinishedProduct } from "./Materials";

function shelf(): FinishedProduct {
  return makeMaterial<FinishedProduct>({
    type: "rusticShelf",
    species: "pallet",
  });
}

function listingAt(askingPrice: number, listedAtTick = 0): MarketListing {
  return { id: "l-1", material: shelf(), askingPrice, listedAtTick };
}

describe("priceFactor", () => {
  it("is exactly 1 at the curve center", () => {
    const factor = priceFactor(priceCurveCenter(0), 0);
    assert.ok(Math.abs(factor - 1) < 1e-9);
  });

  it("rewards underpricing and punishes overpricing", () => {
    assert.ok(priceFactor(0.7, 0) > priceFactor(1, 0));
    assert.ok(priceFactor(1, 0) > priceFactor(1.3, 0));
    // Overpriced with no reputation: effectively never sells
    assert.ok(priceFactor(1.5, 0) < 0.05);
  });

  it("gives reputation pricing power", () => {
    // A high-rep shop sells above fair value about as easily as a nobody
    // sells at fair value
    assert.ok(priceFactor(1.3, 100) > priceFactor(1.05, 0));
  });
});

describe("listingSaleChance", () => {
  it("slows down when the category is saturated", () => {
    const listing = listingAt(getSellValue(shelf()));
    const fullDemand = listingSaleChance(listing, 0, {});
    const saturated = listingSaleChance(listing, 0, { rusticShelf: 0 });
    assert.ok(saturated < fullDemand);
    assert.ok(saturated > 0, "saturation slows sales but never stops them");
  });

  it("gives a worthless material no chance to sell", () => {
    const junk: MarketListing = {
      id: "l-2",
      material: { id: "u-1", type: "unknown" },
      askingPrice: 10,
      listedAtTick: 0,
    };
    assert.strictEqual(listingSaleChance(junk, 0, {}), 0);
  });
});

describe("listingPitySale", () => {
  const fairValue = getSellValue(shelf());

  it("fires for a fairly priced listing after the pity window", () => {
    assert.strictEqual(
      listingPitySale(listingAt(fairValue), LISTING_PITY_TICKS),
      true,
    );
  });

  it("does not fire before the window", () => {
    assert.strictEqual(
      listingPitySale(listingAt(fairValue), LISTING_PITY_TICKS - 1),
      false,
    );
  });

  it("never fires for an overpriced listing", () => {
    assert.strictEqual(
      listingPitySale(listingAt(fairValue + 1), LISTING_PITY_TICKS * 10),
      false,
    );
  });
});

describe("reviewReputationGain", () => {
  it("rewards underpricing more than fair pricing", () => {
    assert.ok(reviewReputationGain(100, 50) > reviewReputationGain(100, 100));
  });

  it("is capped and never negative", () => {
    assert.strictEqual(reviewReputationGain(100, 1), 0.3);
    assert.ok(reviewReputationGain(100, 1000) >= 0);
  });
});

describe("maxAcceptedJobs", () => {
  it("starts at one slot and grows to five with reputation", () => {
    assert.strictEqual(maxAcceptedJobs(0), 1);
    assert.strictEqual(maxAcceptedJobs(100), 5);
  });
});

describe("jobPayout", () => {
  const job: AcceptedJob = {
    id: "job-1",
    name: "Dana R.",
    description: "Test job",
    requiredMaterials: [],
    basePay: 100,
    baseReputation: 2,
    postedAtTick: 0,
    materialCostFree: true,
    acceptedAtTick: 1000,
  };

  it("pays the full tip on instant delivery", () => {
    const payout = jobPayout(job, 1000);
    assert.strictEqual(payout.money, 100 * (1 + JOB_TIP_FRACTION));
    assert.strictEqual(payout.reputation, 4);
  });

  it("decays the tip linearly and bottoms out at base pay", () => {
    const halfway = jobPayout(job, 1000 + JOB_TIP_DECAY_TICKS / 2);
    assert.strictEqual(halfway.money, 100 * (1 + JOB_TIP_FRACTION / 2));

    const late = jobPayout(job, 1000 + JOB_TIP_DECAY_TICKS * 2);
    assert.strictEqual(late.money, 100);
    assert.strictEqual(late.reputation, 2);
  });
});
