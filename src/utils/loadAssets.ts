import { worktableArtPaths } from "../components/machine-sprites/worktable-art";
import { SHEET_FACE_TEXTURE_ASSETS } from "../components/material-sprites/sheetFaceTextures";
import { Assets } from "pixi.js";
import { CONSUMABLE_TYPES, ConsumableId } from "../game/Consumable";
import { TOOL_TYPES, ToolId } from "../game/Tool";
import { UPGRADE_TYPES, UpgradeId } from "../game/Upgrade";
import {
  BAR_CLAMP_ICON,
  BROOM_ICON,
  IDS_WITHOUT_ICON_ART,
  SHOP_VAC_ICON,
  consumableIconSrc,
  toolIconSrc,
  upgradeIconSrc,
} from "./uiImages";

/**
 * The tool icons double as the shop-floor sprite for a tool lying loose
 * (see ToolItemSprite), so PIXI needs them alongside the machine art.
 */
const TOOL_ITEM_ASSETS = (Object.keys(TOOL_TYPES) as ToolId[])
  .filter((toolId) => !IDS_WITHOUT_ICON_ART.tools.includes(toolId))
  .map(toolIconSrc);

/**
 * The supply icons do the same on the store's shelves — a racking bay
 * with no world-size art shows its product's own icon
 * (StoreMerchandiseLayer), so PIXI needs those too.
 */
const SUPPLY_SHELF_ASSETS = [
  ...(Object.keys(CONSUMABLE_TYPES) as ConsumableId[])
    .filter((id) => !IDS_WITHOUT_ICON_ART.consumables.includes(id))
    .map(consumableIconSrc),
  ...(Object.keys(UPGRADE_TYPES) as UpgradeId[])
    .filter((id) => !IDS_WITHOUT_ICON_ART.upgrades.includes(id))
    .map(upgradeIconSrc),
  BAR_CLAMP_ICON,
  SHOP_VAC_ICON,
  BROOM_ICON,
];

/**
 * Pixel art, as opposed to the smooth machine art: these have to sample
 * nearest-neighbor or the shop's fit-to-column upscale blurs them.
 */
const PIXEL_ART_ASSETS = [...TOOL_ITEM_ASSETS, ...SUPPLY_SHELF_ASSETS];

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
  "/images/makeshift-bench@4x.png",
  "/images/person.png",
  // Worktable tops, shadows, and their close-up copies — three layers per
  // table, and only for the tables that have art (see worktable-art.ts)
  ...worktableArtPaths(),
  // The sheet goods' seamless face tiles (see sheetFaceTextures.ts)
  ...SHEET_FACE_TEXTURE_ASSETS,
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

  // The face tiles repeat (a piece's texture window can sit anywhere on
  // the source sheet) and render minified five-fold at shop scale, so
  // they need wrap addressing and mipmaps where the machine art needs
  // neither.
  for (const path of SHEET_FACE_TEXTURE_ASSETS) {
    const source = Assets.get(path).source;
    source.autoGenerateMipmaps = true;
    source.style.addressMode = "repeat";
    source.style.update();
  }
}
