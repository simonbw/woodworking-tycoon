import { Assets } from "pixi.js";

/**
 * Pixel art, as opposed to the smooth machine art: these have to sample
 * nearest-neighbor or the shop's fit-to-column upscale blurs them.
 */
const PIXEL_ART_ASSETS = [
  "/images/shelf.png",
  "/images/rustic-shelf.png",
  "/images/bookshelf.png",
  "/images/side-table.png",
];

// List of all texture assets used in the game
export const TEXTURE_ASSETS = [
  "/images/benchtop-jointer.png",
  "/images/concrete-floor-2-big.png",
  "/images/door-warning-paint.png",
  "/images/jobsite-table-saw-table.png",
  "/images/jobsite-table-saw-fence.png",
  "/images/lunchbox-planer-bottom.png",
  "/images/lunchbox-planer-top.png",
  "/images/lunchbox-planer-screws.png",
  "/images/miter-saw-stationary-base.png",
  "/images/miter-saw-rotating-base.png",
  "/images/miter-saw-top.png",
  "/images/operator-position.png",
  "/images/workspace.png",
  "/images/makeshift-bench.png",
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
