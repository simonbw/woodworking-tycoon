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
import { getMachines } from "../Machine";
import { personCanWork } from "../Person";
import { carryingShopVac } from "../ShopVac";
import { Species } from "../Materials";
import {
  chebyshevDistance,
  Direction,
  rotateVec,
  translateVec,
  vectorEquals,
  Vector,
} from "../Vectors";
import { CellMap } from "../CellMap";
import { emitSound } from "./sound-actions";
import { withXp } from "./skill-actions";

/** Share of a swath cell's dust one tick of sweeping gathers. */
const SWEEP_RATE = 0.9;
/** Reaching under a neighboring machine is slower than open floor. */
const UNDER_MACHINE_RATE = 0.3;
/**
 * The most dust one stroke tick can move, in units. This is what paces
 * the broom: without it a stroke through deep drifts inhales several
 * cells at once and the pan fills in a blink. The take scales down
 * proportionally across the swath, so the whole patch thins together.
 */
export const SWEEP_TICK_CAP = 8;
/** Below this a cell counts as clean and its key is dropped. */
const CLEAN_EPSILON = 0.05;
/** Craft XP per heavy sweeping tick — shopkeeping feeds progression. */
const SWEEP_XP = 1;
/** Ticks gathering less than this grant no XP (no dust-farming). */
const XP_MINIMUM_GATHERED = 6;

/**
 * How much the broom's dustpan holds, in dust units — several buried
 * cells' worth. A fifth of the vac canister: the pan fills fast, and
 * the trips to the garbage can are the broom's real cost.
 */
export const DUSTPAN_CAPACITY = 100;
/** Units poured per tick while holding the empty at the garbage can. */
export const DUSTPAN_EMPTY_RATE = 20;

/** The eight cells around one — the aimed broom works a 3×3 patch. */
const ORTHOGONALS_AND_DIAGONALS: ReadonlyArray<Vector> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

const ORTHOGONALS: ReadonlyArray<Vector> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * How far (chebyshev cells) the mouse can steer the broom head from the
 * body — arm plus handle. The pointer layer clamps to this; the sweep
 * re-checks it so a stale aim can't reach across the shop.
 */
export const SWEEP_AIM_REACH = 2;

/**
 * The cells one tick of sweeping works: the cell underfoot plus a
 * broom-wide swath two cells deep in the facing direction — deep enough
 * that a full-pace walk can't outrun its own broom between ticks.
 */
export function sweepSwath(position: Vector, direction: Direction): Vector[] {
  const forward = rotateVec([1, 0], direction);
  const side = rotateVec([0, 1], direction);
  const cells: Vector[] = [position];
  for (let depth = 1; depth <= 2; depth++) {
    for (let breadth = -1; breadth <= 1; breadth++) {
      cells.push(
        translateVec(position, [
          forward[0] * depth + side[0] * breadth,
          forward[1] * depth + side[1] * breadth,
        ]),
      );
    }
  }
  return cells;
}

/** Whether this position touches the garbage can — where the dustpan
 * and the vac canister both empty. */
export function nextToGarbageCan(
  gameState: GameState,
  position: Vector,
): boolean {
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

/** Room left in the dustpan, in dust units. */
export function dustpanRoom(gameState: GameState): number {
  return Math.max(0, DUSTPAN_CAPACITY - dustTotal(gameState.dustpan));
}

/** How full the dustpan is, 0–1. Drives the hands-strip readout. */
export function dustpanFillFraction(gameState: GameState): number {
  return Math.min(1, dustTotal(gameState.dustpan) / DUSTPAN_CAPACITY);
}

/**
 * Take the broom off the floor and into the hands. Committing: with the
 * broom in hand the player can't pick up stock, run a machine, or grab
 * the vac — Space belongs to sweeping until the broom is set down (F).
 */
export function pickUpBroomAction(): GameAction {
  return (gameState) => {
    if (!gameState.progression.sweepingUnlocked) {
      return gameState;
    }
    if (
      gameState.broomPosition === null ||
      chebyshevDistance(gameState.broomPosition, gameState.player.position) > 1
    ) {
      return gameState;
    }
    if (
      !personCanWork(gameState.player) ||
      gameState.player.carriedMachine != null ||
      gameState.player.inventory.length > 0 ||
      carryingShopVac(gameState)
    ) {
      return gameState;
    }
    return emitSound(
      { ...gameState, broomPosition: null },
      { kind: "material-pickup" },
    );
  };
}

/** Lean the broom on the floor right here — pan contents and all. */
export function putDownBroomAction(): GameAction {
  return (gameState) => {
    if (!holdingBroom(gameState) || gameState.player.away !== null) {
      return gameState;
    }
    // The broom stays in hand on the lot — it leans on shop floor, not lawn
    if (isOutdoors(gameState.shopInfo, gameState.player.position)) {
      return gameState;
    }
    return emitSound(
      { ...gameState, broomPosition: gameState.player.position },
      { kind: "material-drop" },
    );
  };
}

/**
 * One tick of broom-and-dustpan work, run from tickAction while the
 * player holds the operate key with the broom in hand — the same
 * held-Space idiom as pushing stock through a machine, with no
 * busyTicks freeze: walking and sweeping happen together.
 *
 * Each tick the broom gathers most of the dust in its swath straight
 * into the dustpan. The pan holds DUSTPAN_CAPACITY; full, the stroke
 * does nothing until it's emptied — the same hold, standing next to
 * the garbage can, pours it out a chunk per tick (the vac canister's
 * idiom, at a fifth the size and five times the trips).
 */
export function sweepTickPass(): GameAction {
  return (gameState) => {
    if (
      !holdingBroom(gameState) ||
      gameState.player.operating !== true ||
      !personCanWork(gameState.player)
    ) {
      return gameState;
    }

    const { player } = gameState;

    // At the can, the hold empties the pan instead of sweeping
    if (
      dustTotal(gameState.dustpan) > 0 &&
      nextToGarbageCan(gameState, player.position)
    ) {
      return {
        ...gameState,
        dustpan: drainAmounts(gameState.dustpan, DUSTPAN_EMPTY_RATE),
      };
    }

    const room = dustpanRoom(gameState);
    if (room <= 0) {
      return gameState;
    }

    const shopSize = gameState.shopInfo.size;
    const cellMap = CellMap.fromGameState(gameState);

    // The mouse can steer the head: with a live aim in reach, the broom
    // works the patch around the aimed cell — reaching around a
    // machine's legs — instead of the facing swath.
    const aim =
      player.sweepAim != null &&
      chebyshevDistance(player.sweepAim, player.position) <= SWEEP_AIM_REACH
        ? player.sweepAim
        : null;
    const swath = (
      aim
        ? [aim, ...ORTHOGONALS_AND_DIAGONALS.map((d) => translateVec(aim, d))]
        : sweepSwath(player.position, player.direction)
    ).filter((cell) => inBounds(cell, shopSize));

    // First size the stroke, then scale it to what the tick and the pan
    // can take — proportionally, so the whole swath thins together
    const cellRate = (cell: Vector) =>
      cellMap.at(cell)?.machine ? UNDER_MACHINE_RATE : SWEEP_RATE;
    const wanted = swath.reduce(
      (sum, cell) =>
        sum + dustTotal(gameState.dust[dustKey(cell)]) * cellRate(cell),
      0,
    );
    if (wanted <= 0) {
      return gameState;
    }
    const factor = Math.min(1, Math.min(room, SWEEP_TICK_CAP) / wanted);

    const pan: Partial<Record<Species, number>> = { ...gameState.dustpan };
    const dust: Record<string, Partial<Record<Species, number>>> = {
      ...gameState.dust,
    };
    let gatheredTotal = 0;
    for (const cell of swath) {
      const key = dustKey(cell);
      const amounts = dust[key];
      if (!amounts) {
        continue;
      }
      const takenFraction = cellRate(cell) * factor;
      const remaining: Partial<Record<Species, number>> = {};
      for (const [species, amount] of Object.entries(amounts)) {
        const moved = (amount ?? 0) * takenFraction;
        if (moved > 0) {
          pan[species as Species] = (pan[species as Species] ?? 0) + moved;
        }
        const left = (amount ?? 0) - moved;
        if (left > CLEAN_EPSILON) {
          remaining[species as Species] = left;
        }
      }
      gatheredTotal += dustTotal(amounts) * takenFraction;
      if (dustTotal(remaining)) {
        dust[key] = remaining;
      } else {
        delete dust[key];
      }
    }

    if (gatheredTotal <= 0) {
      return gameState;
    }

    const swept = { ...gameState, dust: dust as DustMap, dustpan: pan };
    return gatheredTotal >= XP_MINIMUM_GATHERED
      ? withXp(swept, SWEEP_XP)
      : swept;
  };
}

/** True when there's anything the broom in hand could sweep from here. */
export function canSweepAt(gameState: GameState): boolean {
  return sweepSwath(
    gameState.player.position,
    gameState.player.direction,
  ).some((cell) => cellDust(gameState.dust, cell) > CLEAN_EPSILON);
}
