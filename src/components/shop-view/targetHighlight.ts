import { Filter } from "pixi.js";
import { OutlineFilter, OutlineFilterOptions } from "pixi-filters/outline";
import { CANVAS_RESOLUTION } from "../world-view/canvas-resolution";

/**
 * An outline filter that rasterizes at the canvas's own resolution. A
 * filter renders its target into an intermediate texture, and PIXI's
 * default pins that texture at 1x — on a high-density display the
 * filtered object came back CSS-stretched and blurry the moment the
 * white rim appeared. "inherit" keeps the texture at the render
 * target's resolution; thickness is measured in that texture's physical
 * pixels (the shader divides by texture size), so it scales by the same
 * resolution to keep the rim's on-screen weight.
 */
function crispOutline(
  options: OutlineFilterOptions & { thickness: number },
): OutlineFilter {
  const filter = new OutlineFilter({
    ...options,
    thickness: options.thickness * CANVAS_RESOLUTION,
  });
  filter.resolution = "inherit";
  return filter;
}

/**
 * The in-world targeting treatment, shared by everything the keyboard is
 * about to act on: the machine the player stands at and the pile E would
 * pick up wear the same white rim, so "this is the target" reads the same
 * for stations and stock. An outline shader hugging the silhouette rather
 * than a box around the footprint — the white line carries a soft dark
 * halo outside it to stay readable over any floor or art.
 *
 * One shared array: pixi filters hold no per-object state, so the same
 * instances can dress every highlighted object in a frame.
 */
export const TARGET_HIGHLIGHT_FILTERS: Filter[] = [
  crispOutline({
    thickness: 2.5,
    color: 0xffffff,
    alpha: 0.9,
    quality: 0.5,
  }),
  crispOutline({
    thickness: 2,
    color: 0x1c1917,
    alpha: 0.35,
    quality: 0.5,
  }),
];

/**
 * What the guided opening points at (see game/tutorial.ts). Deliberately
 * a different color from the white targeting rim: white means "the keys
 * act on this, here, now", and orange means "go to this next" — a thing
 * you usually aren't standing at yet. When both apply the white rim wins,
 * because by then the tutorial's arrow has done its job.
 */
export const TUTORIAL_HIGHLIGHT_FILTERS: Filter[] = [
  crispOutline({
    thickness: 2.5,
    color: 0xf59e0b,
    alpha: 0.9,
    quality: 0.5,
  }),
  crispOutline({
    thickness: 2,
    color: 0x1c1917,
    alpha: 0.35,
    quality: 0.5,
  }),
];
