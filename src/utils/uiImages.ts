import { ConsumableId, CONSUMABLE_TYPES } from "../game/Consumable";
import { MachineId } from "../game/Machine";
import { ToolId, TOOL_TYPES } from "../game/Tool";
import { UpgradeId, UPGRADE_TYPES } from "../game/Upgrade";

/**
 * Where the HTML UI's images live, and how to have them in hand before
 * anything asks to draw one.
 *
 * The shop floor's textures go through `loadAssets`, which blocks boot
 * until PIXI has all of them. Nothing did the same for the `<img>` tags in
 * the overlays, so those fetched on first paint: opening the store popped
 * a column of tool icons in one row at a time, and the manual's photos
 * arrived after the paragraphs had already been laid out around empty
 * boxes. These are small files and the fetch is quick — quick enough that
 * it reads as flicker rather than loading, which is worse than either.
 *
 * The paths live here rather than next to the components that draw them so
 * that the preload list can't fall behind the icons: every icon component
 * in `ItemIcon.tsx` builds its `src` from one of the helpers below, and the
 * list is built from the same helpers over the id registries.
 */

const ICON_DIR = "/images/icons";

export const toolIconSrc = (toolId: ToolId) => `${ICON_DIR}/tool-${toolId}.png`;

export const consumableIconSrc = (consumableId: ConsumableId) =>
  `${ICON_DIR}/consumable-${consumableId}.png`;

export const upgradeIconSrc = (upgradeId: UpgradeId) =>
  `${ICON_DIR}/upgrade-${upgradeId}.png`;

/** One-offs with no id registry behind them. */
export const BAR_CLAMP_ICON = `${ICON_DIR}/misc-barClamp.png`;
export const SHOP_VAC_ICON = `${ICON_DIR}/misc-shopVac.png`;
export const BROOM_ICON = `${ICON_DIR}/misc-broom.png`;

/** The painted shop sign on the start menu. */
export const MAIN_TITLE_LOGO = "/images/main-title-logo.png";

/**
 * Shop-floor art first, pixel stand-in second, so the thing on the store
 * shelf is the thing that lands on the floor. A machine with neither
 * renders nothing rather than a broken image.
 */
export const MACHINE_ICON_SRC: Partial<Record<MachineId, string>> = {
  jobsiteTableSaw: "/images/jobsite-table-saw.png",
  miterSaw: "/images/miter-saw.png",
  lunchboxPlaner: "/images/lunchbox-planer.png",
  jointer: "/images/benchtop-jointer.png",
  bandSaw: "/images/bandsaw-14.png",
  garbageCan: "/images/garbage-can.png",
  // Worktables are never sold, but they're built from plans and shown in
  // the blueprint corner — the flattened export is the one to show when a
  // table stands on its own, shadow and all.
  worktable1x1: "/images/workbench-2x2-complete.png",
  worktable1x2: "/images/workbench-2x4-complete.png",
};

/**
 * Ids whose icon hasn't been drawn yet. Their components still ask for the
 * file — that is a gap in the art, tracked in `docs/asset-backlog.md`, not
 * something the preloader should paper over — but there is no point
 * spending a request at boot to find out it 404s again.
 *
 * `uiImages.test.ts` checks this list against the icon directory, so it
 * fails the moment one of these gets art (delete the entry) or a path that
 * used to resolve stops resolving.
 */
export const IDS_WITHOUT_ICON_ART: {
  tools: ToolId[];
  consumables: ConsumableId[];
  upgrades: UpgradeId[];
} = {
  tools: ["circularSaw"],
  consumables: [],
  upgrades: ["toolDrawers", "materialShelf"],
};

/**
 * The rest: photos the shop manual sets into its articles, and the pallet
 * the material widgets draw. Both of these also happen to be shop-floor
 * textures, so PIXI has already fetched them — an `<img>` still wants its
 * own decoded copy, and asking for a file the browser is holding costs
 * nothing.
 */
const LOOSE_UI_IMAGES = ["/images/makeshift-bench.png", "/images/pallet.png"];

const ids = <T extends string>(registry: Record<T, unknown>) =>
  Object.keys(registry) as T[];

/**
 * Every image the HTML UI can draw, once. Deliberately not "every file in
 * `static/images`": the floor texture alone is 7MB and PIXI already has
 * it, and the unused floors and favicons in there would be a megabyte
 * spent on nothing.
 */
export const UI_IMAGE_ASSETS: readonly string[] = Array.from(
  new Set([
    ...ids(TOOL_TYPES)
      .filter((id) => !IDS_WITHOUT_ICON_ART.tools.includes(id))
      .map(toolIconSrc),
    ...ids(CONSUMABLE_TYPES)
      .filter((id) => !IDS_WITHOUT_ICON_ART.consumables.includes(id))
      .map(consumableIconSrc),
    ...ids(UPGRADE_TYPES)
      .filter((id) => !IDS_WITHOUT_ICON_ART.upgrades.includes(id))
      .map(upgradeIconSrc),
    BAR_CLAMP_ICON,
    SHOP_VAC_ICON,
    BROOM_ICON,
    // On screen before this ever runs — index.html preloads it so it's
    // painted with the start menu. Listed here so it's held for the
    // session and the registration check can see it.
    MAIN_TITLE_LOGO,
    ...Object.values(MACHINE_ICON_SRC),
    ...LOOSE_UI_IMAGES,
  ]),
);

/**
 * The warmed images, kept for the life of the page.
 *
 * This array is the whole point of it, not bookkeeping. An `Image` nobody
 * holds is a *dead* resource the moment `warm` resolves: it survives only
 * in the renderer's memory cache, which drops dead entries whenever it
 * wants the room back. The files here carry no cache headers either — the
 * dev server sends none, so nothing lands in the disk cache to fall back
 * on — and the result is that the preload wears off. Open the store within
 * a few seconds of boot and every icon is there; open it after a few
 * minutes of play and they refetch one at a time, a tenth of a second
 * each, which is the row-by-row pop-in this file was written to stop.
 *
 * Holding the reference keeps each one a live resource with its decoded
 * copy intact, so the `<img>` the store mounts is filled from memory
 * rather than from the network. It costs a few hundred KB of pixels for
 * the session — the price of the flicker staying gone.
 */
const warmed: HTMLImageElement[] = [];

/** Fetch and decode one image, resolving either way — a missing file is
 * not worth failing over at boot. */
function warm(src: string): Promise<void> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      warmed.push(image);
      // Decoding here, off-screen, is the half that actually stops the
      // pop-in: a cached-but-undecoded image still misses the frame it
      // first appears in.
      const decoded = image.decode?.();
      if (decoded) {
        decoded.then(() => resolve()).catch(() => resolve());
      } else {
        resolve();
      }
    };
    image.onerror = () => resolve();
    image.src = src;
  });
}

/**
 * Warm every UI image in the background.
 *
 * Unlike the textures and the fonts this does *not* gate boot. None of
 * these images are on screen at the first frame — they are behind the
 * store, the journal, and the manual — so making the shop wait on them
 * would trade a flicker nobody sees for a delay everybody does. Kicking
 * off at the first idle moment instead means they are in hand long before
 * the player opens anything, without taking a slice out of the opening
 * frames.
 */
export function preloadUiImages(): void {
  if (typeof window === "undefined") return;

  const start = () => {
    for (const src of UI_IMAGE_ASSETS) void warm(src);
  };

  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(start, { timeout: 2000 });
  } else {
    setTimeout(start, 0);
  }
}
