import { ToolType } from "../Tool";

/**
 * Share of a machine's dust a mounted bag captures before it hits the
 * floor. The first rung of the mitigation ladder (see
 * docs/dust-and-cleaning.md): cheap, per-machine, and it doesn't fill
 * up — that chore arrives with the central dust collector.
 */
export const DUST_BAG_CAPTURE = 0.6;

/**
 * A canvas collection bag strapped to a machine's dust port. No
 * operations of its own — its whole job is what doesn't end up on the
 * floor.
 */
export const dustBag: ToolType = {
  id: "dustBag",
  name: "Dust Bag",
  description:
    "A canvas bag for a machine's dust port. Catches most of the mess " +
    "at the source — the floor stays cleaner far longer.",
  cost: 45,
  compatibleMachines: [
    "jobsiteTableSaw",
    "miterSaw",
    "lunchboxPlaner",
    "jointer",
  ],
  operations: [],
};
