import { Filter } from "pixi.js";
import { OutlineFilter } from "pixi-filters/outline";

/**
 * The in-world targeting treatment, shared by everything the keyboard is
 * about to act on: the machine the player stands at and the pile E would
 * pick up wear the same amber rim, so "this is the target" reads the same
 * for stations and stock. An outline shader hugging the silhouette rather
 * than a box around the footprint — the amber line carries a soft dark
 * halo outside it to stay readable over any floor or art.
 *
 * One shared array: pixi filters hold no per-object state, so the same
 * instances can dress every highlighted object in a frame.
 */
export const TARGET_HIGHLIGHT_FILTERS: Filter[] = [
  new OutlineFilter({
    thickness: 2.5,
    color: 0xf59e0b,
    alpha: 0.9,
    quality: 0.5,
  }),
  new OutlineFilter({
    thickness: 2,
    color: 0x1c1917,
    alpha: 0.35,
    quality: 0.5,
  }),
];
