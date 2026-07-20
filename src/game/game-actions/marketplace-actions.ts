import { GameAction, MarketListing } from "../GameState";
import { MaterialInstance } from "../Materials";
import { generateJobBoard } from "../job-generation";
import {
  DEMAND_DIP_PER_SALE,
  DEMAND_RECOVERY_PER_TICK,
  JOB_CANCEL_REPUTATION_LOSS,
  JOB_OFFER_LIFETIME_TICKS,
  categoryDemandFor,
  demandCategory,
  jobPayout,
  listingPitySale,
  listingSaleChance,
  maxAcceptedJobs,
  reviewReputationGain,
  roundToCents,
  roundToHundredth,
} from "../marketplace";
import { getSellValue } from "../material-values";
import { materialMeetsInput } from "../material-helpers";
import { TICKS_PER_DAY } from "../time";
import { idMaker } from "../../utils/idMaker";
import { emitSound } from "./sound-actions";
import { withXp } from "./skill-actions";

const makeListingId = idMaker();

// ------------------------------------------------------------------ Listings

/** Puts an inventory item up for sale at the player's chosen price. */
export function listItemAction(
  material: MaterialInstance,
  askingPrice: number,
): GameAction {
  return (gameState) => {
    if (!gameState.progression.marketplaceUnlocked) {
      console.warn("Marketplace is not unlocked yet");
      return gameState;
    }
    if (!gameState.player.inventory.some((item) => item === material)) {
      console.warn("Tried to list material not in inventory");
      return gameState;
    }
    if (!(askingPrice > 0)) {
      console.warn("Listings need a positive asking price");
      return gameState;
    }
    const listing: MarketListing = {
      id: `listing-${makeListingId()}`,
      material,
      askingPrice: roundToCents(askingPrice),
      listedAtTick: gameState.tick,
    };
    return {
      ...gameState,
      listings: [...gameState.listings, listing],
      player: {
        ...gameState.player,
        inventory: gameState.player.inventory.filter(
          (item) => item !== material,
        ),
      },
    };
  };
}

/** Takes a listing down and returns the item to the player's inventory. */
export function delistItemAction(listingId: string): GameAction {
  return (gameState) => {
    const listing = gameState.listings.find((l) => l.id === listingId);
    if (!listing) {
      console.warn("Tried to delist an unknown listing");
      return gameState;
    }
    return {
      ...gameState,
      listings: gameState.listings.filter((l) => l !== listing),
      player: {
        ...gameState.player,
        inventory: [...gameState.player.inventory, listing.material],
      },
    };
  };
}

/**
 * Changes a listing's asking price. Resets the listing clock — a new price
 * is a new offer to the market, so the pity timer starts over.
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
    return {
      ...gameState,
      listings: gameState.listings.map((l) =>
        l === listing
          ? {
              ...l,
              askingPrice: roundToCents(askingPrice),
              listedAtTick: gameState.tick,
            }
          : l,
      ),
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
 * Delivers an accepted job from the player's inventory: same matching as
 * commissions, paying base + whatever's left of the tip.
 */
export function deliverJobAction(jobId: string): GameAction {
  return (gameState) => {
    const job = gameState.acceptedJobs.find((j) => j.id === jobId);
    if (!job) {
      console.warn("Tried to deliver an unknown job");
      return gameState;
    }

    for (const requiredMaterial of job.requiredMaterials) {
      const matching = gameState.player.inventory.filter((material) =>
        materialMeetsInput(material, requiredMaterial),
      );
      if (matching.length < requiredMaterial.quantity) {
        console.warn("Player doesn't have required materials for job");
        return gameState;
      }
    }

    let updatedInventory = [...gameState.player.inventory];
    for (const requiredMaterial of job.requiredMaterials) {
      let remainingQuantity = requiredMaterial.quantity;
      updatedInventory = updatedInventory.filter((material) => {
        if (
          remainingQuantity > 0 &&
          materialMeetsInput(material, requiredMaterial)
        ) {
          remainingQuantity--;
          return false;
        }
        return true;
      });
    }

    const payout = jobPayout(job, gameState.tick);
    return withXp(
      emitSound(
        {
          ...gameState,
          money: roundToCents(gameState.money + payout.money),
          reputation: roundToHundredth(
            gameState.reputation + payout.reputation,
          ),
          acceptedJobs: gameState.acceptedJobs.filter((j) => j !== job),
          player: { ...gameState.player, inventory: updatedInventory },
        },
        { kind: "commission-complete" },
      ),
      Math.round(payout.money / 5),
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
    const chance = listingSaleChance(
      listing,
      gameState.reputation,
      categoryDemand,
    );
    const sells = rng() < chance || listingPitySale(listing, gameState.tick);
    if (!sells) {
      remaining.push(listing);
      continue;
    }
    sold = true;
    money = roundToCents(money + listing.askingPrice);
    reputation = roundToHundredth(
      reputation +
        reviewReputationGain(
          getSellValue(listing.material),
          listing.askingPrice,
        ),
    );
    const category = demandCategory(listing.material);
    categoryDemand = {
      ...categoryDemand,
      [category]: Math.max(
        0,
        categoryDemandFor(categoryDemand, category) - DEMAND_DIP_PER_SALE,
      ),
    };
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
 * At each day boundary — or whenever the board has emptied out — stale
 * offers rotate off and fresh ones roll in. Gated on the marketplace
 * unlock, so the board first fills the moment the tab appears.
 */
function refreshJobBoard(
  gameState: Parameters<GameAction>[0],
  rng: () => number,
) {
  if (!gameState.progression.marketplaceUnlocked) {
    return gameState;
  }
  const dayBoundary = gameState.tick % TICKS_PER_DAY === 0;
  if (!dayBoundary && gameState.jobBoard.length > 0) {
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
  return { ...gameState, jobBoard };
}
