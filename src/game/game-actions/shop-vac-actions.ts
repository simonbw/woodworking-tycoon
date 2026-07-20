import { getMachines } from "../Machine";
import { cellDust, dustKey, DustMap, dustTotal, SpeciesAmounts } from "../Dust";
import { GameAction, GameState } from "../GameState";
import {
  canisterRoom,
  carryingShopVac,
  SHOP_VAC_COST,
  SHOP_VAC_PASSIVE_RATE,
  VACUUM_TICKS,
} from "../ShopVac";
import { Species } from "../Materials";
import { translateVec, Vector, vectorEquals } from "../Vectors";
import { withXp } from "./skill-actions";

/** Adjacent tiles get most of a burst — the hose reaches, the nozzle wins. */
const VACUUM_ADJACENT_EFFICIENCY = 0.6;
/** Vacuuming this much or more earns the token XP (mirrors sweeping). */
const XP_MINIMUM_GATHERED = 5;
const VACUUM_XP = 1;

const ORTHOGONALS: ReadonlyArray<Vector> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

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
      return {
        ...gameState,
        shopVac: { ...vac, position: gameState.player.position },
      };
    }
    if (vectorEquals(vac.position, gameState.player.position)) {
      return { ...gameState, shopVac: { ...vac, position: null } };
    }
    return gameState;
  };
}

/**
 * An active burst while dragging the vac: the cell underfoot goes to
 * zero and the orthogonal neighbors — machine cells very much included,
 * that's the vac's edge over the broom — lose most of theirs, limited by
 * canister room. Costs VACUUM_TICKS via the busyTicks plumbing.
 */
export function vacuumAction(): GameAction {
  return (gameState) => {
    const vac = gameState.shopVac;
    if (!vac || !carryingShopVac(gameState)) {
      return gameState;
    }

    const gathered: Array<{ key: string; amounts: SpeciesAmounts }> = [];
    const gatherFrom = (position: Vector, efficiency: number) => {
      const amounts = gameState.dust[dustKey(position)];
      if (!amounts) {
        return;
      }
      const taken: Partial<Record<Species, number>> = {};
      for (const [species, amount] of Object.entries(amounts)) {
        if ((amount ?? 0) > 0) {
          taken[species as Species] = (amount ?? 0) * efficiency;
        }
      }
      if (dustTotal(taken) > 0) {
        gathered.push({ key: dustKey(position), amounts: taken });
      }
    };

    gatherFrom(gameState.player.position, 1);
    for (const delta of ORTHOGONALS) {
      gatherFrom(
        translateVec(gameState.player.position, delta),
        VACUUM_ADJACENT_EFFICIENCY,
      );
    }

    const room = canisterRoom(vac);
    const gatheredTotal = gathered.reduce(
      (sum, { amounts }) => sum + dustTotal(amounts),
      0,
    );
    if (gatheredTotal <= 0 || room <= 0) {
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
      player: {
        ...gameState.player,
        canWork: false,
        busyTicks: VACUUM_TICKS - 1,
      },
    };
    const gainedXp = gatheredTotal * keepFraction >= XP_MINIMUM_GATHERED;
    return gainedXp ? withXp(vacuumed, VACUUM_XP) : vacuumed;
  };
}

/**
 * The vac's per-tick behaviors while it's being dragged: a passive
 * trickle-clean of the cell underfoot, and the canister dumping itself
 * the moment the player stops next to the garbage can. Run every tick.
 */
export function shopVacTickPass(): GameAction {
  return (gameState) => {
    const vac = gameState.shopVac;
    if (!vac || !carryingShopVac(gameState) || gameState.player.away) {
      return gameState;
    }
    let next = gameState;

    // Trickle: the nozzle drags over whatever you walk across
    const underfoot = next.dust[dustKey(next.player.position)];
    const room = canisterRoom(vac);
    if (underfoot && room > 0) {
      const total = dustTotal(underfoot);
      const take = Math.min(SHOP_VAC_PASSIVE_RATE, total, room);
      if (take > 0) {
        const { dust, moved } = moveDustToCanister(
          next.dust,
          vac.canister,
          [{ key: dustKey(next.player.position), amounts: underfoot }],
          take / total,
        );
        next = { ...next, dust, shopVac: { ...vac, canister: moved } };
      }
    }

    // At the garbage can, the canister empties itself — the trip is the
    // chore, not a button
    if (
      dustTotal(next.shopVac!.canister) > 0 &&
      nextToGarbageCan(next, next.player.position)
    ) {
      next = { ...next, shopVac: { ...next.shopVac!, canister: {} } };
    }
    return next;
  };
}

function nextToGarbageCan(gameState: GameState, position: Vector): boolean {
  const garbageCells = getMachines(gameState.machines)
    .filter((machine) => machine.type.id === "garbageCan")
    .flatMap((machine) =>
      machine.type.cellsOccupied.map((cell) => machine.localToShop(cell)),
    );
  return garbageCells.some((cell) =>
    ORTHOGONALS.some((delta) =>
      vectorEquals(translateVec(position, delta), cell),
    ),
  );
}

/**
 * Move `keepFraction` of the gathered amounts from the floor into the
 * canister, dropping floor cells that come up clean. Shared by the
 * burst and the passive trickle.
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

/** Anything a vacuum burst from here could pick up? Drives the hint. */
export function canVacuumAt(gameState: GameState): boolean {
  if (cellDust(gameState.dust, gameState.player.position) > 0.05) {
    return true;
  }
  return ORTHOGONALS.some(
    (delta) =>
      cellDust(gameState.dust, translateVec(gameState.player.position, delta)) >
      0.05,
  );
}
