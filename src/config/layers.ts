import { V } from "../core/Vector";
import { LayerInfo } from "../core/graphics/LayerInfo";

/**
 * The render layers, back to front — the old ShopView's JSX order as a
 * table. World layers share the camera (world coordinates are the old
 * shell's world pixels, 48 to a cell — see `shop-scale`); the HUD layers
 * are screen space (paralax 0).
 */
export const LAYERS = {
  /** The lot: lawn, driveway, the building's walls, stand, truck, passersby. */
  environment: new LayerInfo(),
  /** The shop's slab and floor tiles. */
  floor: new LayerInfo(),
  /** Sawdust on the floor. */
  dust: new LayerInfo(),
  /** Things lying on the floor: power cords, the leaning broom, crates, piles. */
  floorItems: new LayerInfo(),
  /** The machines, with their worktable shadows. */
  machines: new LayerInfo(),
  /** Cut spray, feed lanes, and other in-world effects over the machines. */
  effects: new LayerInfo(),
  /** Anything unclaimed lands here, between effects and actors. */
  main: new LayerInfo(),
  /** The bodies: shop vac in tow, the player, whoever else walks. */
  actors: new LayerInfo(),
  /** What rides above the body: dust motes, the carried machine. */
  carried: new LayerInfo(),
  /** The daylight tint over the whole world. */
  daylight: new LayerInfo(),
  /** Screen-space chrome drawn by the canvas (most HUD is DOM). */
  hud: new LayerInfo({ paralax: V(0, 0) }),
  /** Absolute top, debugging only. */
  debugHud: new LayerInfo({ paralax: V(0, 0) }),
} satisfies { [key: string]: LayerInfo };

// Within the machines layer, draw order is by zIndex: worktable cast
// shadows under every table's top, worktable tops under the benchtop
// machines mounted on them (see MachineView's zIndex bands).
LAYERS.machines.container.sortableChildren = true;

export type LayerName = keyof typeof LAYERS;

/** The layer that sprites that do not specify a layer will be added to. */
export const DEFAULT_LAYER: LayerName = "main";
