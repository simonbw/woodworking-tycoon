import { Assets } from "pixi.js";

// List of all texture assets used in the game
const TEXTURE_ASSETS = [
  "/images/concrete-floor-2-big.png",
  "/images/jobsite-table-saw-table.png",
  "/images/jobsite-table-saw-fence.png",
  "/images/lunchbox-planer-bottom.png",
  "/images/lunchbox-planer-top.png",
  "/images/lunchbox-planer-screws.png",
  "/images/miter-saw-base.png",
  "/images/miter-saw-top.png",
  "/images/operator-position.png",
  "/images/workspace.png",
  "/images/makeshift-bench.png",
  "/images/person.png",
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
}
