import { GameAction, GameState } from "../GameState";
import { getMaterialName } from "../material-helpers";
import { getSellValue } from "../material-values";
import { MaterialInstance } from "../Materials";
import { handSpaceLeft } from "../Person";
import {
  atStand,
  Customer,
  customerSpan,
  CUSTOMER_BROWSE_TICKS,
  CUSTOMER_BUY_CHANCE,
  CUSTOMER_SPAWN_CHANCE_EMPTY,
  CUSTOMER_SPAWN_CHANCE_STOCKED,
  CUSTOMER_SPEED,
  isSellable,
  MAX_CUSTOMERS,
  pickPurchase,
  roundToCents,
  roundToHundredth,
  saleReputationGain,
  standFrontage,
} from "../stand";
import { isNight } from "../time-flow";
import { emitPayout } from "./payout-actions";

/**
 * Sets pieces from the arms out on the stand, the way the truck's bed
 * loads: one per press, an armful with Shift. Only sellable pieces go
 * out — raw stock stays in hand. The chip never offers an unsellable
 * piece, but the action enforces both rules anyway because where and
 * what the stand sells is a game rule.
 */
export function setOutAtStandAction(
  materials: ReadonlyArray<MaterialInstance>,
): GameAction {
  return (gameState) => {
    if (!atStand(gameState.shopInfo, gameState.player.position)) {
      console.warn("Tried to set out pieces away from the stand");
      return gameState;
    }
    if (materials.length === 0) {
      console.warn("Tried to set out nothing");
      return gameState;
    }
    if (
      !materials.every((material) =>
        gameState.player.inventory.some((item) => item === material),
      )
    ) {
      console.warn("Tried to set out material not in inventory");
      return gameState;
    }
    if (!materials.every(isSellable)) {
      console.warn("Tried to set out something nobody would pay for");
      return gameState;
    }
    return {
      ...gameState,
      stand: [...gameState.stand, ...materials],
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
 * Takes pieces back off the stand into the arms — the newest set out
 * first, as many as asked for, capped by what the hands can still hold.
 */
export function takeFromStandAction(count = 1): GameAction {
  return (gameState) => {
    if (!atStand(gameState.shopInfo, gameState.player.position)) {
      console.warn("Tried to take from the stand out of reach");
      return gameState;
    }
    const taken = Math.min(
      count,
      gameState.stand.length,
      handSpaceLeft(gameState.player),
    );
    if (taken <= 0) {
      console.warn("Tried to take from the stand with full hands");
      return gameState;
    }
    const kept = gameState.stand.slice(0, gameState.stand.length - taken);
    const returned = gameState.stand.slice(gameState.stand.length - taken);
    return {
      ...gameState,
      stand: kept,
      player: {
        ...gameState.player,
        inventory: [...gameState.player.inventory, ...returned],
      },
    };
  };
}

/** What a plain press takes back: the newest piece set out. */
export function standTopItem(
  stand: ReadonlyArray<MaterialInstance>,
): MaterialInstance | undefined {
  return stand[stand.length - 1];
}

/**
 * The per-tick street pass, run by tickAction: customers stroll the
 * sidewalk, one may stop at a stocked stand and buy, and finished
 * walkers step off the ends of the block. Randomness comes in as a
 * parameter so the sequence tier can pin it (see tickAction).
 *
 * A sale settles instantly — money, reputation, and the lifetime sale
 * count move in the same reducer — and queues a PayoutEvent, which
 * RewardFlightLayer turns into the cha-ching and the fly-in wherever
 * the player happens to be standing.
 */
export function standTickPass(rng: () => number = Math.random): GameAction {
  return (gameState) => {
    // Foot traffic follows the stand: a stocked table draws people down
    // the street, a bare one sees the odd stroller. Nobody at night.
    const spawnChance =
      gameState.stand.length > 0
        ? CUSTOMER_SPAWN_CHANCE_STOCKED
        : CUSTOMER_SPAWN_CHANCE_EMPTY;
    const spawning =
      !isNight(gameState) &&
      gameState.customers.length < MAX_CUSTOMERS &&
      rng() < spawnChance;
    if (gameState.customers.length === 0 && !spawning) {
      return gameState;
    }

    const span = customerSpan(gameState.shopInfo);
    const frontage = standFrontage(gameState.shopInfo);

    let stand = gameState.stand;
    let money = gameState.money;
    let reputation = gameState.reputation;
    let salesCompleted = gameState.progression.salesCompleted;
    let payout: { title: string; money: number; reputation: number } | null =
      null;

    const customers: Customer[] = [];
    for (const customer of gameState.customers) {
      if (customer.state === "browsing") {
        if (customer.browseTicksLeft > 1) {
          customers.push({
            ...customer,
            browseTicksLeft: customer.browseTicksLeft - 1,
          });
          continue;
        }
        // Decision time. One purchase per browse at most; either way
        // they move along afterwards and don't stop again.
        const purchase =
          rng() < CUSTOMER_BUY_CHANCE ? pickPurchase(stand, rng) : null;
        if (purchase) {
          const value = roundToCents(getSellValue(purchase));
          const reputationGain = saleReputationGain(value);
          stand = stand.filter((item) => item !== purchase);
          money = roundToCents(money + value);
          reputation = roundToHundredth(reputation + reputationGain);
          salesCompleted += 1;
          payout = {
            title: getMaterialName(purchase),
            money: value,
            reputation: reputationGain,
          };
        }
        customers.push({ ...customer, state: "leaving", browseTicksLeft: 0 });
        continue;
      }

      const x = customer.x + CUSTOMER_SPEED * customer.walkDirection;
      if (x < span.left || x > span.right) {
        continue; // walked off the end of the block
      }
      const passingStand =
        customer.state === "walking" &&
        stand.length > 0 &&
        x >= frontage.left &&
        x <= frontage.right;
      if (passingStand) {
        customers.push({
          ...customer,
          x,
          state: "browsing",
          browseTicksLeft: CUSTOMER_BROWSE_TICKS,
        });
      } else {
        customers.push({ ...customer, x });
      }
    }

    if (spawning) {
      const walkDirection: 1 | -1 = rng() < 0.5 ? 1 : -1;
      customers.push({
        // Derived, not minted: React may run an updater twice against the
        // same base state, and a counter would spawn twins (see emitPayout).
        id: `customer-${gameState.tick}-${customers.length}`,
        x: walkDirection === 1 ? span.left : span.right,
        walkDirection,
        state: "walking",
        browseTicksLeft: 0,
      });
    }

    let next: GameState = {
      ...gameState,
      customers,
      stand,
      money,
      reputation,
      progression: { ...gameState.progression, salesCompleted },
    };
    if (payout) {
      next = emitPayout(next, {
        kind: "sale",
        title: payout.title,
        money: payout.money,
        reputation: payout.reputation,
        xp: 0,
      });
    }
    return next;
  };
}
