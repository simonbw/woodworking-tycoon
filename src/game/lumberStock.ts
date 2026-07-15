import { BoardDimension, REAL_WOOD_SPECIES, Species } from "./Materials";

export interface LumberSku {
  readonly length: BoardDimension;
  readonly width: BoardDimension;
  readonly thickness: BoardDimension;
}

/**
 * The store stocks a few common sizes of board — you work with what they
 * carry. Cutting stock down to what a project actually needs is the game.
 */
export const LUMBER_SKUS: ReadonlyArray<LumberSku> = [
  { length: 8, width: 4, thickness: 4 },
  { length: 6, width: 6, thickness: 4 },
  { length: 4, width: 8, thickness: 8 },
];

/** Species the store carries. Pallet wood isn't sold — go scavenge it. */
export const STORE_SPECIES: ReadonlyArray<Species> = REAL_WOOD_SPECIES;
