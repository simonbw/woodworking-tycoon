import {
  cellDust,
  drainAmounts,
  dustKey,
  DustMap,
  dustTotal,
  inBounds,
  SpeciesAmounts,
} from "../Dust";
import { GameAction, GameState } from "../GameState";
import { holdingBroom } from "../HeldTool";
import { isOutdoors } from "../lot";
import {
  canisterRoom,
  carryingShopVac,
  SHOP_VAC_COST,
  SHOP_VAC_EMPTY_RATE,
  SHOP_VAC_PASSIVE_RATE,
} from "../ShopVac";
import { personCanWork } from "../Person";
import { Species } from "../Materials";
import { nextToGarbageCan, sweepSwath } from "./dust-actions";
import { chebyshevDistance, Vector, vectorEquals } from "../Vectors";
import { withXp } from "./skill-actions";

/** Share of the underfoot cell's dust one suction tick takes. */
const VACUUM_UNDERFOOT_RATE = 0.9;
/** The facing cone pulls slower — but machine undersides included: the
 * hose reaches where the broom fumbles. */
const VACUUM_CONE_RATE = 0.45;
/** Suction ticks gathering less than this grant no XP (mirrors sweeping). */
const XP_MINIMUM_GATHERED = 15;
const VACUUM_XP = 1;

/** Bought at the store; it's delivered to the material dropoff spot. */
export function buyShopVacAction(): GameAction {
  return (gameState) => {
    if (gameState.shopVac !== null) {
      console.warn("Already own a shop vac");
      return gameState;
    }
    if (gameState.money < SHOP_VAC_COST) {
      console.warn("Tried to buy the shop vac without enough money");
      return gameState;
    }
    return {
      ...gameState,
      money: gameState.money - SHOP_VAC_COST,
      shopVac: {
        position: gameState.shopInfo.materialDropoffPosition,
        canister: {},
      },
    };
  };
}

/**
 * Grab the vac (standing on it) or park it right here (dragging it).
 * Anything else is a no-op — you can't grab what you're not next to.
 */
export function toggleCarryShopVacAction(): GameAction {
  return (gameState) => {
    const vac = gameState.shopVac;
    if (!vac) {
      return gameState;
    }
    if (vac.position === null) {
      // Keep dragging it on the lot — the vac parks on shop floor only
      if (isOutdoors(gameState.shopInfo, gameState.player.position)) {
        return gameState;
      }
      return {
        ...gameState,
        shopVac: { ...vac, position: gameState.player.position },
      };
    }
    // The hose takes a hand — put the broom down before grabbing the vac
    if (holdingBroom(gameState)) {
      return gameState;
    }
    if (chebyshevDistance(vac.position, gameState.player.position) <= 1) {
      return { ...gameState, shopVac: { ...vac, position: null } };
    }
    return gameState;
  };
}

/**
 * One tick of suction, run from tickAction while the player holds the
 * operate key with the hose in hand — the same held-Space idiom as the
 * broom, with the vac's own shape: the same swath of cells, machine
 * undersides very much included, cleaned to zero instead of pushed into
 * a pile. Dust goes into the canister until it's full; a full canister
 * kills the suction until it's emptied.
 *
 * Standing next to the garbage can, the same hold empties the canister
 * instead, a chunk per tick — the trip is the chore, and the emptying
 * is deliberately a moment rather than a silent side effect.
 */
export function vacuumTickPass(): GameAction {
  return (gameState) => {
    const vac = gameState.shopVac;
    if (
      !vac ||
      !carryingShopVac(gameState) ||
      gameState.player.operating !== true ||
      !personCanWork(gameState.player)
    ) {
      return gameState;
    }

    // At the can, the hold drains the canister
    if (
      dustTotal(vac.canister) > 0 &&
      nextToGarbageCan(gameState, gameState.player.position)
    ) {
      return {
        ...gameState,
        shopVac: {
          ...vac,
          canister: drainAmounts(vac.canister, SHOP_VAC_EMPTY_RATE),
        },
      };
    }

    const room = canisterRoom(vac);
    if (room <= 0) {
      return gameState;
    }

    const shopSize = gameState.shopInfo.size;
    const swath = sweepSwath(
      gameState.player.position,
      gameState.player.direction,
    ).filter((cell) => inBounds(cell, shopSize));

    const gathered: Array<{ key: string; amounts: SpeciesAmounts }> = [];
    for (const cell of swath) {
      const amounts = gameState.dust[dustKey(cell)];
      if (!amounts) {
        continue;
      }
      const rate = vectorEquals(cell, gameState.player.position)
        ? VACUUM_UNDERFOOT_RATE
        : VACUUM_CONE_RATE;
      const taken: Partial<Record<Species, number>> = {};
      for (const [species, amount] of Object.entries(amounts)) {
        if ((amount ?? 0) > 0) {
          taken[species as Species] = (amount ?? 0) * rate;
        }
      }
      if (dustTotal(taken) > 0) {
        gathered.push({ key: dustKey(cell), amounts: taken });
      }
    }

    const gatheredTotal = gathered.reduce(
      (sum, { amounts }) => sum + dustTotal(amounts),
      0,
    );
    if (gatheredTotal <= 0) {
      return gameState;
    }
    const keepFraction = Math.min(1, room / gatheredTotal);

    const { dust, moved } = moveDustToCanister(
      gameState.dust,
      vac.canister,
      gathered,
      keepFraction,
    );

    const vacuumed = {
      ...gameState,
      dust,
      shopVac: { ...vac, canister: moved },
    };
    const gainedXp = gatheredTotal * keepFraction >= XP_MINIMUM_GATHERED;
    return gainedXp ? withXp(vacuumed, VACUUM_XP) : vacuumed;
  };
}

/**
 * The vac's per-tick behavior while it's being dragged: a passive
 * trickle-clean of the cell underfoot — the nozzle drags over whatever
 * you walk across. Run every tick. Emptying is not here: that's a
 * deliberate hold at the garbage can (vacuumTickPass), not a side
 * effect of walking past it.
 */
export function shopVacTickPass(): GameAction {
  return (gameState) => {
    const vac = gameState.shopVac;
    if (!vac || !carryingShopVac(gameState) || gameState.player.away) {
      return gameState;
    }

    const underfoot = gameState.dust[dustKey(gameState.player.position)];
    const room = canisterRoom(vac);
    if (!underfoot || room <= 0) {
      return gameState;
    }
    const total = dustTotal(underfoot);
    const take = Math.min(SHOP_VAC_PASSIVE_RATE, total, room);
    if (take <= 0) {
      return gameState;
    }
    const { dust, moved } = moveDustToCanister(
      gameState.dust,
      vac.canister,
      [{ key: dustKey(gameState.player.position), amounts: underfoot }],
      take / total,
    );
    return { ...gameState, dust, shopVac: { ...vac, canister: moved } };
  };
}

/**
 * Move `keepFraction` of the gathered amounts from the floor into the
 * canister, dropping floor cells that come up clean. Shared by the
 * suction tick and the passive trickle.
 */
function moveDustToCanister(
  dustMap: DustMap,
  canister: SpeciesAmounts,
  gathered: ReadonlyArray<{ key: string; amounts: SpeciesAmounts }>,
  keepFraction: number,
): { dust: DustMap; moved: SpeciesAmounts } {
  const CLEAN_EPSILON = 0.05;
  const dust: Record<string, Partial<Record<Species, number>>> = {
    ...dustMap,
  };
  const contents: Partial<Record<Species, number>> = { ...canister };
  for (const { key, amounts } of gathered) {
    const cell: Partial<Record<Species, number>> = { ...dust[key] };
    for (const [species, amount] of Object.entries(amounts)) {
      const moved = (amount ?? 0) * keepFraction;
      contents[species as Species] =
        (contents[species as Species] ?? 0) + moved;
      const left = (cell[species as Species] ?? 0) - moved;
      if (left > CLEAN_EPSILON) {
        cell[species as Species] = left;
      } else {
        delete cell[species as Species];
      }
    }
    if (dustTotal(cell)) {
      dust[key] = cell;
    } else {
      delete dust[key];
    }
  }
  return { dust, moved: contents };
}

/** Anything a suction tick from here could pick up? Drives the hint. */
export function canVacuumAt(gameState: GameState): boolean {
  return sweepSwath(gameState.player.position, gameState.player.direction).some(
    (cell) => cellDust(gameState.dust, cell) > 0.05,
  );
}
