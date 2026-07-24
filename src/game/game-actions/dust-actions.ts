import {
  cellDust,
  dustKey,
  DustMap,
  dustTotal,
  inBounds,
  SAWDUST_PILE_CAPACITY,
  SpeciesAmounts,
} from "../Dust";
import { GameAction, MaterialPile } from "../GameState";
import { makeMaterial } from "../material-helpers";
import { SawdustPile, Species } from "../Materials";
import { rotateVec, translateVec, vectorEquals, Vector } from "../Vectors";
import { CellMap } from "../CellMap";
import { withXp } from "./skill-actions";

/** A sweep occupies the player this many ticks (1 now + rest busy). */
export const SWEEP_TICKS = 3;
/** Share of a cell's dust one sweep gathers — a broom leaves a film. */
const SWEEP_EFFICIENCY = 0.9;
/** Reaching under a neighboring machine is slower than open floor. */
const UNDER_MACHINE_EFFICIENCY = 0.5;
/** Below this a cell counts as clean and its key is dropped. */
const CLEAN_EPSILON = 0.05;
/** Craft XP per meaningful sweep — shopkeeping feeds progression. */
const SWEEP_XP = 1;
/** Sweeps gathering less than this grant no XP (no dust-farming). */
const XP_MINIMUM_GATHERED = 5;

/**
 * Sweep the floor at hand: one broom pass gathers most of the dust from
 * the 3×3 patch around the player (cells are one square foot — a body
 * and a broom cover several), with a slower pull from the machine cells
 * in reach, into a sawdust pile on the cell the player faces (or
 * underfoot, when facing a machine or wall). Piles hold
 * SAWDUST_PILE_CAPACITY; whatever doesn't fit stays on the floor.
 * Sweeping is the only thing that runs during its SWEEP_TICKS — the
 * busyTicks plumbing in tickAction handles the wait.
 */
export function sweepAction(): GameAction {
  return (gameState) => {
    if (!gameState.progression.sweepingUnlocked) {
      return gameState;
    }

    const { player } = gameState;
    const shopSize = gameState.shopInfo.size;
    const cellMap = CellMap.fromGameState(gameState);

    // What one pass of the broom can gather, per source cell
    const gathered: Array<{ key: string; amounts: SpeciesAmounts }> = [];
    const gatherFrom = (position: Vector, efficiency: number) => {
      const key = dustKey(position);
      const amounts = gameState.dust[key];
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
        gathered.push({ key, amounts: taken });
      }
    };

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cell = translateVec(player.position, [dx, dy]);
        if (!inBounds(cell, shopSize)) {
          continue;
        }
        gatherFrom(
          cell,
          cellMap.at(cell)?.machine
            ? UNDER_MACHINE_EFFICIENCY
            : SWEEP_EFFICIENCY,
        );
      }
    }

    // The pile grows on the cell we're sweeping toward; against a wall or
    // a machine the pile just forms underfoot
    const facing = translateVec(
      player.position,
      rotateVec([1, 0], player.direction),
    );
    const pilePosition =
      inBounds(facing, shopSize) && !cellMap.at(facing)?.machine
        ? facing
        : player.position;

    const existingPile = gameState.materialPiles.find(
      (pile) =>
        pile.material.type === "sawdustPile" &&
        vectorEquals(pile.position, pilePosition),
    );
    const existingContents: SpeciesAmounts =
      existingPile?.material.type === "sawdustPile"
        ? existingPile.material.contents
        : {};

    // Only what fits in the pile leaves the floor
    const room = SAWDUST_PILE_CAPACITY - dustTotal(existingContents);
    const gatheredTotal = gathered.reduce(
      (sum, { amounts }) => sum + dustTotal(amounts),
      0,
    );
    if (gatheredTotal <= 0 || room <= 0) {
      return gameState;
    }
    const keepFraction = Math.min(1, room / gatheredTotal);

    // Move the kept fraction off the floor…
    const dust: Record<string, Partial<Record<Species, number>>> = {
      ...gameState.dust,
    };
    const contents: Partial<Record<Species, number>> = { ...existingContents };
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

    // …and into the pile
    const pileMaterial = makeMaterial<SawdustPile>({
      type: "sawdustPile",
      contents,
    });
    const materialPiles: ReadonlyArray<MaterialPile> = [
      ...gameState.materialPiles.filter((pile) => pile !== existingPile),
      { material: pileMaterial, position: pilePosition },
    ];

    const swept = {
      ...gameState,
      dust: dust as DustMap,
      materialPiles,
      player: {
        ...player,
        canWork: false,
        busyTicks: SWEEP_TICKS - 1,
      },
    };
    const gainedXp = gatheredTotal * keepFraction >= XP_MINIMUM_GATHERED;
    return gainedXp ? withXp(swept, SWEEP_XP) : swept;
  };
}

/** True when there's anything a sweep from this cell could gather. */
export function canSweepAt(gameState: {
  dust: DustMap;
  player: { position: Vector };
}): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cell = translateVec(gameState.player.position, [dx, dy]);
      if (cellDust(gameState.dust, cell) > CLEAN_EPSILON) {
        return true;
      }
    }
  }
  return false;
}
