import { Machine } from "./Machine";
import { Species } from "./Materials";
import { Vector, translateVec, vectorEquals } from "./Vectors";

/**
 * Sawdust on the shop floor (see docs/dust-and-cleaning.md). Amounts are
 * tracked per species so the floor's color mix survives a save/load —
 * planing walnut leaves walnut-dark shavings, not generic dust.
 */
export type SpeciesAmounts = Readonly<Partial<Record<Species, number>>>;

/** Per-cell sawdust, keyed "x,y". Sparse: a missing key is a clean cell. */
export type DustMap = Readonly<Record<string, SpeciesAmounts>>;

/** A cell holds this much dust, total across species, before it spills. */
export const DUST_MAX_PER_CELL = 100;

/**
 * Share of an emission that lands on the machine's own cells (and its
 * operation position); the rest falls on the orthogonal neighbors.
 */
const CORE_SHARE = 0.7;

const ORTHOGONALS: ReadonlyArray<Vector> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export const dustKey = ([x, y]: Vector): string => `${x},${y}`;

export function dustKeyToVec(key: string): Vector {
  const [x, y] = key.split(",").map(Number);
  return [x, y];
}

/** Total dust in a cell's species record, in units. */
export function dustTotal(amounts: SpeciesAmounts | undefined): number {
  if (!amounts) {
    return 0;
  }
  let sum = 0;
  for (const value of Object.values(amounts)) {
    sum += value ?? 0;
  }
  return sum;
}

export function cellDust(dust: DustMap, position: Vector): number {
  return dustTotal(dust[dustKey(position)]);
}

export interface DustDeposit {
  readonly position: Vector;
  readonly species: Species;
  readonly amount: number;
}

function inBounds([x, y]: Vector, [width, height]: Vector): boolean {
  return x >= 0 && x < width && y >= 0 && y < height;
}

type MutableDustMap = Record<string, Partial<Record<Species, number>>>;

/**
 * Apply deposits to the map, immutably. Cells clamp at DUST_MAX_PER_CELL;
 * what doesn't fit spills once to the least-dusty in-bounds orthogonal
 * neighbor (drifts pile outward instead of growing forever). Deposits
 * aimed out of bounds are lost against the walls.
 */
export function depositDust(
  dust: DustMap,
  deposits: ReadonlyArray<DustDeposit>,
  shopSize: Vector,
): DustMap {
  if (deposits.length === 0) {
    return dust;
  }
  const work: MutableDustMap = { ...dust };
  // Cells cloned for writing this pass, so shared cells are never mutated
  const cloned = new Set<string>();

  const cellAt = (key: string): Partial<Record<Species, number>> => {
    if (!cloned.has(key)) {
      work[key] = { ...work[key] };
      cloned.add(key);
    }
    return work[key];
  };

  const add = (
    position: Vector,
    species: Species,
    amount: number,
    spill: boolean,
  ): void => {
    if (amount <= 0 || !inBounds(position, shopSize)) {
      return;
    }
    const cell = cellAt(dustKey(position));
    const room = DUST_MAX_PER_CELL - dustTotal(cell);
    const landed = Math.min(amount, Math.max(room, 0));
    if (landed > 0) {
      cell[species] = (cell[species] ?? 0) + landed;
    }
    const overflow = amount - landed;
    if (overflow > 0 && spill) {
      const neighbors = ORTHOGONALS.map((delta) =>
        translateVec(position, delta),
      ).filter((neighbor) => inBounds(neighbor, shopSize));
      if (neighbors.length > 0) {
        const leastDusty = neighbors.reduce((a, b) =>
          dustTotal(work[dustKey(b)]) < dustTotal(work[dustKey(a)]) ? b : a,
        );
        add(leastDusty, species, overflow, false);
      }
    }
  };

  for (const deposit of deposits) {
    add(deposit.position, deposit.species, deposit.amount, true);
  }
  return work;
}

/**
 * The cells a machine dusts: its occupied cells plus operation position
 * (core), and their orthogonal neighbors (ring). Not bounds-checked —
 * depositDust drops what lands outside the shop.
 */
export function machineDustCells(machine: Machine): {
  core: ReadonlyArray<Vector>;
  ring: ReadonlyArray<Vector>;
} {
  const core = machine.type.cellsOccupied.map((cell) =>
    machine.localToShop(cell),
  );
  const operationPosition = machine.absoluteOperationPosition;
  if (
    operationPosition &&
    !core.some((cell) => vectorEquals(cell, operationPosition))
  ) {
    core.push(operationPosition);
  }
  const coreKeys = new Set(core.map(dustKey));
  const ring: Vector[] = [];
  const ringKeys = new Set<string>();
  for (const cell of core) {
    for (const delta of ORTHOGONALS) {
      const neighbor = translateVec(cell, delta);
      const key = dustKey(neighbor);
      if (!coreKeys.has(key) && !ringKeys.has(key)) {
        ringKeys.add(key);
        ring.push(neighbor);
      }
    }
  }
  return { core, ring };
}

/**
 * Land one tick's worth of a machine's dust, split evenly across the
 * given species. Deterministic — the organic look comes from the render
 * layer, never from state.
 */
export function emitMachineDust(
  dust: DustMap,
  machine: Machine,
  species: ReadonlyArray<Species>,
  amount: number,
  shopSize: Vector,
): DustMap {
  if (amount <= 0 || species.length === 0) {
    return dust;
  }
  const { core, ring } = machineDustCells(machine);
  const ringShare = ring.length > 0 ? 1 - CORE_SHARE : 0;
  const coreShare = 1 - ringShare;
  const deposits: DustDeposit[] = [];
  for (const oneSpecies of species) {
    const perSpecies = amount / species.length;
    for (const cell of core) {
      deposits.push({
        position: cell,
        species: oneSpecies,
        amount: (perSpecies * coreShare) / core.length,
      });
    }
    for (const cell of ring) {
      deposits.push({
        position: cell,
        species: oneSpecies,
        amount: (perSpecies * ringShare) / ring.length,
      });
    }
  }
  return depositDust(dust, deposits, shopSize);
}
