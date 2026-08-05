import { GameAction, MarketListing } from "../GameState";
import { MaterialInstance } from "../Materials";
import { handSpaceLeft } from "../Person";
import { availableJobTemplateIds, generateJobBoard } from "../job-generation";
import {
  DEMAND_DIP_PER_SALE,
  DEMAND_RECOVERY_PER_TICK,
  JOB_CANCEL_REPUTATION_LOSS,
  JOB_OFFER_LIFETIME_TICKS,
  categoryDemandFor,
  demandCategory,
  jobPayout,
  listingGroupKey,
  listingItem,
  listingPitySale,
  listingSaleChance,
  maxAcceptedJobs,
  reviewReputationGain,
  roundToCents,
  roundToHundredth,
} from "../marketplace";
import { getSellValue } from "../material-values";
import { canHandOff, consumeRequiredMaterials } from "../delivery";
import { idMaker } from "../../utils/idMaker";
import { emitPayout } from "./payout-actions";
import { emitSound } from "./sound-actions";
import { withXp } from "./skill-actions";

const makeListingId = idMaker();

// ------------------------------------------------------------------ Listings

/**
 * Puts inventory items up for sale at the player's chosen price. Pieces
 * that belong to the same offer — same group key, same price — go up as
 * one stacked listing rather than a row apiece, whether they're listed
 * together or added to an offer that's already standing.
 */
export function listItemsAction(
  materials: ReadonlyArray<MaterialInstance>,
  askingPrice: number,
): GameAction {
  return (gameState) => {
    if (!gameState.progression.marketplaceUnlocked) {
      console.warn("Marketplace is not unlocked yet");
      return gameState;
    }
    if (materials.length === 0) {
      console.warn("Tried to list nothing");
      return gameState;
    }
    if (
      !materials.every((material) =>
        gameState.player.inventory.some((item) => item === material),
      )
    ) {
      console.warn("Tried to list material not in inventory");
      return gameState;
    }
    const key = listingGroupKey(materials[0]);
    if (!materials.every((material) => listingGroupKey(material) === key)) {
      console.warn("Tried to list mismatched materials as one offer");
      return gameState;
    }
    if (!(askingPrice > 0)) {
      console.warn("Listings need a positive asking price");
      return gameState;
    }

    const price = roundToCents(askingPrice);
    const standing = gameState.listings.find(
      (listing) =>
        listing.askingPrice === price &&
        listingGroupKey(listingItem(listing)) === key,
    );
    const listings = standing
      ? gameState.listings.map((listing) =>
          listing === standing
            ? { ...listing, materials: [...listing.materials, ...materials] }
            : listing,
        )
      : [
          ...gameState.listings,
          {
            id: `listing-${makeListingId()}`,
            materials: [...materials],
            askingPrice: price,
            listedAtTick: gameState.tick,
          },
        ];

    return {
      ...gameState,
      listings,
      player: {
        ...gameState.player,
        inventory: gameState.player.inventory.filter(
          (item) => !materials.includes(item),
        ),
      },
    };
  };
}

/**
 * Takes pieces off a listing and back into the player's inventory —
 * as many as asked for, capped by what the arms can still hold. An offer
 * with nothing left on it comes down.
 */
export function delistItemAction(listingId: string, count = 1): GameAction {
  return (gameState) => {
    const listing = gameState.listings.find((l) => l.id === listingId);
    if (!listing) {
      console.warn("Tried to delist an unknown listing");
      return gameState;
    }
    // The pieces come back into the arms, so they need the same room any
    // pickup does.
    const taken = Math.min(
      count,
      listing.materials.length,
      handSpaceLeft(gameState.player),
    );
    if (taken <= 0) {
      console.warn("Tried to delist with full hands");
      return gameState;
    }
    const returned = listing.materials.slice(0, taken);
    const left = listing.materials.slice(taken);
    return {
      ...gameState,
      listings: gameState.listings.flatMap((l) =>
        l !== listing
          ? [l]
          : left.length > 0
            ? [{ ...l, materials: left }]
            : [],
      ),
      player: {
        ...gameState.player,
        inventory: [...gameState.player.inventory, ...returned],
      },
    };
  };
}

/**
 * Changes a listing's asking price. Resets the listing clock — a new price
 * is a new offer to the market, so the pity timer starts over. Repricing
 * onto another offer's price merges the two: at most one listing exists
 * per group key and price.
 */
export function repriceListingAction(
  listingId: string,
  askingPrice: number,
): GameAction {
  return (gameState) => {
    const listing = gameState.listings.find((l) => l.id === listingId);
    if (!listing) {
      console.warn("Tried to reprice an unknown listing");
      return gameState;
    }
    if (!(askingPrice > 0)) {
      console.warn("Listings need a positive asking price");
      return gameState;
    }
    const price = roundToCents(askingPrice);
    const key = listingGroupKey(listingItem(listing));
    const twin = gameState.listings.find(
      (l) =>
        l !== listing &&
        l.askingPrice === price &&
        listingGroupKey(listingItem(l)) === key,
    );
    return {
      ...gameState,
      listings: gameState.listings.flatMap((l) => {
        if (l === listing) {
          // Merged away into the twin, which keeps its own id and clock.
          return twin
            ? []
            : [{ ...l, askingPrice: price, listedAtTick: gameState.tick }];
        }
        if (l === twin) {
          return [{ ...l, materials: [...l.materials, ...listing.materials] }];
        }
        return [l];
      }),
    };
  };
}

// ---------------------------------------------------------------------- Jobs

/** Accepts an open offer, if a job slot is free. */
export function acceptJobAction(jobId: string): GameAction {
  return (gameState) => {
    const offer = gameState.jobBoard.find((job) => job.id === jobId);
    if (!offer) {
      console.warn("Tried to accept an unknown job");
      return gameState;
    }
    if (
      gameState.acceptedJobs.length >= maxAcceptedJobs(gameState.reputation)
    ) {
      console.warn("No free job slots");
      return gameState;
    }
    return {
      ...gameState,
      jobBoard: gameState.jobBoard.filter((job) => job !== offer),
      acceptedJobs: [
        ...gameState.acceptedJobs,
        { ...offer, acceptedAtTick: gameState.tick },
      ],
    };
  };
}

/**
 * Backs out of an accepted job — the one true penalty in the system, a
 * small reputation loss. (Letting an unaccepted offer expire costs nothing.)
 */
export function cancelJobAction(jobId: string): GameAction {
  return (gameState) => {
    const job = gameState.acceptedJobs.find((j) => j.id === jobId);
    if (!job) {
      console.warn("Tried to cancel an unknown job");
      return gameState;
    }
    return {
      ...gameState,
      acceptedJobs: gameState.acceptedJobs.filter((j) => j !== job),
      reputation: roundToHundredth(
        Math.max(0, gameState.reputation - JOB_CANCEL_REPUTATION_LOSS),
      ),
    };
  };
}

/**
 * Hands an accepted job over to its customer at the garage door: same
 * matching and same body state as a commission, paying base plus whatever
 * is left of the tip.
 */
export function deliverJobAction(jobId: string): GameAction {
  return (gameState) => {
    const job = gameState.acceptedJobs.find((j) => j.id === jobId);
    if (!job) {
      console.warn("Tried to deliver an unknown job");
      return gameState;
    }
    if (!canHandOff(gameState)) {
      console.warn("Can't deliver work right now");
      return gameState;
    }

    const updatedBed = consumeRequiredMaterials(
      gameState.truck.bed,
      job.requiredMaterials,
    );
    if (updatedBed === null) {
      console.warn("The bed doesn't hold what the job requires");
      return gameState;
    }

    const payout = jobPayout(job, gameState.tick);
    const xp = Math.round(payout.money / 5);
    // No stinger here: a job is routine work, not a boss. Its whole audio
    // is the cha-ching the reward flight plays when the money lands.
    return withXp(
      emitPayout(
        {
          ...gameState,
          money: roundToCents(gameState.money + payout.money),
          reputation: roundToHundredth(
            gameState.reputation + payout.reputation,
          ),
          acceptedJobs: gameState.acceptedJobs.filter((j) => j !== job),
          truck: { ...gameState.truck, bed: updatedBed },
        },
        {
          kind: "job",
          title: job.name,
          money: payout.money,
          reputation: payout.reputation,
          xp,
        },
      ),
      xp,
    );
  };
}

// ---------------------------------------------------------------- Tick passes

/**
 * The per-tick marketplace pass, run by tickAction: demand meters recover,
 * every listing rolls its sale chance (or pity-sells), and the job board
 * refreshes at day boundaries. Randomness comes in as a parameter so tests
 * can pin it down.
 */
export function marketplaceTickPass(
  rng: () => number = Math.random,
): GameAction {
  return (gameState) => {
    gameState = recoverDemand(gameState);
    gameState = rollListingSales(gameState, rng);
    gameState = refreshJobBoard(gameState, rng);
    return gameState;
  };
}

/** Demand meters climb back toward full; fully recovered meters drop out. */
function recoverDemand(gameState: Parameters<GameAction>[0]) {
  const entries = Object.entries(gameState.categoryDemand);
  if (entries.length === 0) {
    return gameState;
  }
  const categoryDemand: Record<string, number> = {};
  for (const [category, demand] of entries) {
    const recovered = demand + DEMAND_RECOVERY_PER_TICK;
    if (recovered < 1) {
      categoryDemand[category] = recovered;
    }
  }
  return { ...gameState, categoryDemand };
}

function rollListingSales(
  gameState: Parameters<GameAction>[0],
  rng: () => number,
) {
  if (gameState.listings.length === 0) {
    return gameState;
  }

  let money = gameState.money;
  let reputation = gameState.reputation;
  let categoryDemand = gameState.categoryDemand;
  let sold = false;
  const remaining: MarketListing[] = [];

  for (const listing of gameState.listings) {
    // Every piece on the offer rolls for its own buyer, and each sale dips
    // the category meter under the rolls still to come — so a stack of ten
    // floods its market exactly the way ten separate listings used to.
    const pity = listingPitySale(listing, gameState.tick);
    const unsold: MaterialInstance[] = [];
    for (const material of listing.materials) {
      const chance = listingSaleChance(
        material,
        listing.askingPrice,
        gameState.reputation,
        categoryDemand,
      );
      if (!(rng() < chance || pity)) {
        unsold.push(material);
        continue;
      }
      sold = true;
      money = roundToCents(money + listing.askingPrice);
      reputation = roundToHundredth(
        reputation +
          reviewReputationGain(getSellValue(material), listing.askingPrice),
      );
      const category = demandCategory(material);
      categoryDemand = {
        ...categoryDemand,
        [category]: Math.max(
          0,
          categoryDemandFor(categoryDemand, category) - DEMAND_DIP_PER_SALE,
        ),
      };
    }
    if (unsold.length === listing.materials.length) {
      remaining.push(listing);
    } else if (unsold.length > 0) {
      remaining.push({ ...listing, materials: unsold });
    }
  }

  if (!sold) {
    return gameState;
  }
  return emitSound(
    {
      ...gameState,
      money,
      reputation,
      categoryDemand,
      listings: remaining,
    },
    { kind: "sale" },
  );
}

/**
 * The empty-board refill alone, on demand. The tick pass does this too,
 * but ticks creep while the player idles — this lets the UI cadence
 * (see Ticker) top the board back up the moment the marketplace unlocks
 * or the last offer is accepted, the way the next tick used to.
 */
export function refillEmptyJobBoardAction(
  rng: () => number = Math.random,
): GameAction {
  return (gameState) => {
    if (!gameState.progression.marketplaceUnlocked) {
      return gameState;
    }
    if (gameState.jobBoard.length > 0) {
      return gameState;
    }
    return refreshJobBoard(gameState, rng);
  };
}

/**
 * Each morning the shop hasn't seen yet — or whenever the board has
 * emptied out — stale offers rotate off and fresh ones roll in. The day
 * only turns over by sleeping, so in play this is *new offers every
 * morning*, checked on the phone with the first coffee. Gated on the
 * marketplace unlock, so the board first fills the moment the tab
 * appears.
 */
function refreshJobBoard(
  gameState: Parameters<GameAction>[0],
  rng: () => number,
) {
  if (!gameState.progression.marketplaceUnlocked) {
    return gameState;
  }
  const newMorning = gameState.day !== gameState.jobBoardDay;
  if (!newMorning && gameState.jobBoard.length > 0) {
    return gameState;
  }
  const fresh = gameState.jobBoard.filter(
    (offer) => gameState.tick - offer.postedAtTick < JOB_OFFER_LIFETIME_TICKS,
  );
  // Keep unexpired offers and top the board back up to a full set. The
  // generated set always leads with a material-cost-free offer, and one is
  // forced onto the board even when it's already full — the income floor.
  const generated = generateJobBoard(gameState, rng);
  const jobBoard = [...fresh];
  for (const offer of generated) {
    const hasCostFree = jobBoard.some((o) => o.materialCostFree);
    if (jobBoard.length >= generated.length && hasCostFree) {
      break;
    }
    if (jobBoard.length >= generated.length && !offer.materialCostFree) {
      continue;
    }
    jobBoard.push(offer);
  }
  // Record what the board could offer this refresh: anything that appears
  // in this list for the first time next refresh is a new capability and
  // gets its guaranteed burst (see generateJobBoard).
  return {
    ...gameState,
    jobBoard,
    jobBoardDay: gameState.day,
    seenJobTemplateIds: availableJobTemplateIds(gameState),
  };
}
