import {
  cellDust,
  dustKey,
  DustMap,
  dustTotal,
  inBounds,
  SAWDUST_PILE_CAPACITY,
  SpeciesAmounts,
} from "../Dust";
import { GameAction, GameState, MaterialPile } from "../GameState";
import { holdingBroom } from "../HeldTool";
import { personCanWork } from "../Person";
import { carryingShopVac } from "../ShopVac";
import { makeMaterial } from "../material-helpers";
import { SawdustPile, Species } from "../Materials";
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
/** Below this a cell counts as clean and its key is dropped. */
const CLEAN_EPSILON = 0.05;
/** Craft XP per heavy sweeping tick — shopkeeping feeds progression. */
const SWEEP_XP = 1;
/** Ticks gathering less than this grant no XP (no dust-farming). */
const XP_MINIMUM_GATHERED = 15;

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

/** Lean the broom on the floor right here. */
export function putDownBroomAction(): GameAction {
  return (gameState) => {
    if (!holdingBroom(gameState) || gameState.player.away !== null) {
      return gameState;
    }
    return emitSound(
      { ...gameState, broomPosition: gameState.player.position },
      { kind: "material-drop" },
    );
  };
}

/**
 * One tick of push-broom work, run from tickAction while the player
 * holds the operate key with the broom in hand — the same held-Space
 * idiom as pushing stock through a machine, with no busyTicks freeze:
 * walking and sweeping happen together, and that's the point.
 *
 * The broom is a plow. Each tick it gathers most of the dust in its
 * swath — and whole sawdust piles the swath overlaps — into one pile on
 * the cell the player faces, so walking shoves a growing drift ahead of
 * the broom. Letting go of the key just leaves the pile on the floor;
 * sweeping into it again picks it back up. Piles hold
 * SAWDUST_PILE_CAPACITY and whatever doesn't fit stays where it was.
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
    const shopSize = gameState.shopInfo.size;
    const cellMap = CellMap.fromGameState(gameState);

    // The mouse can steer the head: with a live aim in reach, the broom
    // works the patch around the aimed cell — herding a drift around a
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

    // The pile grows on the aimed cell, or the cell the player faces;
    // over a wall or a machine it forms underfoot instead
    const target =
      aim ??
      translateVec(player.position, rotateVec([1, 0], player.direction));
    const pilePosition =
      inBounds(target, shopSize) && !cellMap.at(target)?.machine
        ? target
        : player.position;

    const targetPile = gameState.materialPiles.find(
      (pile) =>
        pile.material.type === "sawdustPile" &&
        vectorEquals(pile.position, pilePosition),
    );
    const contents: Partial<Record<Species, number>> = {
      ...(targetPile?.material.type === "sawdustPile"
        ? targetPile.material.contents
        : {}),
    };
    let room = SAWDUST_PILE_CAPACITY - dustTotal(contents);
    if (room <= 0) {
      return gameState;
    }

    // Move `fraction` of `amounts` into the target pile, scaled down
    // further if the pile hasn't room for all of it. Returns the share of
    // the *fraction* that actually moved (1 = all of it fit).
    const gatherInto = (amounts: SpeciesAmounts, fraction: number): number => {
      const total = dustTotal(amounts) * fraction;
      if (total <= 0 || room <= 0) {
        return 0;
      }
      const kept = Math.min(1, room / total);
      for (const [species, amount] of Object.entries(amounts)) {
        const moved = (amount ?? 0) * fraction * kept;
        if (moved > 0) {
          contents[species as Species] =
            (contents[species as Species] ?? 0) + moved;
        }
      }
      room -= total * kept;
      return kept;
    };

    // The plow front: piles the swath overlaps ride along with the broom
    const removedPiles: MaterialPile[] = [];
    const pileRemainders: MaterialPile[] = [];
    for (const pile of gameState.materialPiles) {
      if (
        pile === targetPile ||
        pile.material.type !== "sawdustPile" ||
        !swath.some((cell) => vectorEquals(cell, pile.position))
      ) {
        continue;
      }
      const kept = gatherInto(pile.material.contents, 1);
      if (kept <= 0) {
        continue;
      }
      removedPiles.push(pile);
      if (kept < 1) {
        const remainder: Partial<Record<Species, number>> = {};
        for (const [species, amount] of Object.entries(
          pile.material.contents,
        )) {
          const left = (amount ?? 0) * (1 - kept);
          if (left > CLEAN_EPSILON) {
            remainder[species as Species] = left;
          }
        }
        if (dustTotal(remainder) > 0) {
          pileRemainders.push({
            material: makeMaterial<SawdustPile>({
              type: "sawdustPile",
              contents: remainder,
            }),
            position: pile.position,
          });
        }
      }
    }

    // Loose dust in the swath, with a slower pull from under machines
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
      const rate = cellMap.at(cell)?.machine ? UNDER_MACHINE_RATE : SWEEP_RATE;
      const before = dustTotal(amounts);
      const kept = gatherInto(amounts, rate);
      const takenFraction = rate * kept;
      if (takenFraction <= 0) {
        continue;
      }
      gatheredTotal += before * takenFraction;
      const remaining: Partial<Record<Species, number>> = {};
      for (const [species, amount] of Object.entries(amounts)) {
        const left = (amount ?? 0) * (1 - takenFraction);
        if (left > CLEAN_EPSILON) {
          remaining[species as Species] = left;
        }
      }
      if (dustTotal(remaining)) {
        dust[key] = remaining;
      } else {
        delete dust[key];
      }
    }

    if (gatheredTotal <= 0 && removedPiles.length === 0) {
      return gameState;
    }

    const materialPiles: ReadonlyArray<MaterialPile> = [
      ...gameState.materialPiles.filter(
        (pile) => pile !== targetPile && !removedPiles.includes(pile),
      ),
      ...pileRemainders,
      {
        material: makeMaterial<SawdustPile>({ type: "sawdustPile", contents }),
        position: pilePosition,
      },
    ];

    const swept = { ...gameState, dust: dust as DustMap, materialPiles };
    return gatheredTotal >= XP_MINIMUM_GATHERED
      ? withXp(swept, SWEEP_XP)
      : swept;
  };
}

/** True when there's anything the broom in hand could sweep from here. */
export function canSweepAt(gameState: GameState): boolean {
  const swath = sweepSwath(
    gameState.player.position,
    gameState.player.direction,
  );
  return (
    swath.some((cell) => cellDust(gameState.dust, cell) > CLEAN_EPSILON) ||
    gameState.materialPiles.some(
      (pile) =>
        pile.material.type === "sawdustPile" &&
        swath.some((cell) => vectorEquals(cell, pile.position)),
    )
  );
}
