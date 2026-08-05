import { Assets } from "pixi.js";
import { TOOL_TYPES, ToolId } from "../game/Tool";
import { IDS_WITHOUT_ICON_ART, toolIconSrc } from "./uiImages";

/**
 * The tool icons double as the shop-floor sprite for a tool lying loose
 * (see ToolItemSprite), so PIXI needs them alongside the machine art.
 */
const TOOL_ITEM_ASSETS = (Object.keys(TOOL_TYPES) as ToolId[])
  .filter((toolId) => !IDS_WITHOUT_ICON_ART.tools.includes(toolId))
  .map(toolIconSrc);

/**
 * Pixel art, as opposed to the smooth machine art: these have to sample
 * nearest-neighbor or the shop's fit-to-column upscale blurs them.
 */
const PIXEL_ART_ASSETS = [...TOOL_ITEM_ASSETS];

// List of all texture assets used in the game
export const TEXTURE_ASSETS = [
  "/images/asphalt.png",
  "/images/grass.png",
  "/images/bandsaw-14-lower.png",
  "/images/bandsaw-14-fence.png",
  "/images/bandsaw-14-upper.png",
  "/images/benchtop-jointer.png",
  "/images/concrete-floor-2-big.png",
  "/images/garbage-can.png",
  "/images/jobsite-table-saw-table.png",
  "/images/jobsite-table-saw-fence.png",
  "/images/lunchbox-planer-bottom.png",
  "/images/lunchbox-planer-top.png",
  "/images/lunchbox-planer-screws.png",
  "/images/miter-saw-stationary-base.png",
  "/images/miter-saw-rotating-base.png",
  "/images/miter-saw-top.png",
  "/images/operator-position.png",
  "/images/pickup-truck.png",
  "/images/workspace.png",
  "/images/makeshift-bench.png",
  // The bench view's close-up copy of the same art (see BenchSceneBackdrop)
  "/images/makeshift-bench-zoomed.png",
  "/images/person.png",
  ...PIXEL_ART_ASSETS,
];

/**
 * Load all game assets before starting the application
 */
export async function loadAssets(): Promise<void> {
  // Add all assets to the Assets cache with their paths as keys
  TEXTURE_ASSETS.forEach((path) => {
    Assets.add({ alias: path, src: path });
  });

  // Load all assets
  await Assets.load(TEXTURE_ASSETS);

  for (const path of PIXEL_ART_ASSETS) {
    Assets.get(path).source.scaleMode = "nearest";
  }
}
