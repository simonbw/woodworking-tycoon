import { CartLine } from "./cart";
import { CLAMP_COST, CLAMP_DESCRIPTION, CLAMP_NAME } from "./Clamp";
import { CONSUMABLE_TYPES, ConsumableId } from "./Consumable";
import { GameState } from "./GameState";
import { BROOM_COST, BROOM_NAME } from "./HeldTool";
import { LumberChannel, StoreId, unlockedLumberChannels } from "./lumberStock";
import { MACHINE_TYPES, MachineId } from "./Machine";
import { makeToolItem } from "./material-helpers";
import { CollisionWorld, Solid, SolidBox } from "./player-motion";
import { unlockedSheetSkus } from "./sheetStock";
import { SHOP_VAC_COST, SHOP_VAC_NAME } from "./ShopVac";
import { TOOL_TYPES, ToolId } from "./Tool";
import { UPGRADE_TYPES, UpgradeId } from "./Upgrade";
import { Direction, Vector } from "./Vectors";

/**
 * The store as a place: the planogram. A store trip walks a real floor
 * (see docs/trips.md), and this module is the pure geometry of that
 * floor — where the racks stand, what each bay sells, where the register
 * and the doors and the parked truck are — in the same units as lot.ts
 * (one cell = one foot, +y toward the street).
 *
 * The layout is generated from the registries rather than hand-placed:
 * lumber racks from LUMBER_CHANNELS, machine bays from MACHINE_TYPES,
 * the tool island from TOOL_TYPES and UPGRADE_TYPES, the supplies run
 * from CONSUMABLE_TYPES. Adding a product to a registry puts it on a
 * shelf with no layout edit here, and a reputation unlock materializes a
 * new rack in the store — locked channels are completely absent, per the
 * usual rule about hiding what isn't earned yet.
 *
 * Two fixture shapes, mirroring how the shelves are shopped:
 * - a **bay** carries one product; standing at it, F puts one in the
 *   cart and E puts one back (see store-interact.ts).
 * - a **rack** carries a product family (a lumber channel, the sheet
 *   rack); walking to it opens its card, the same station-sheet idiom
 *   the machines use — you walk for the category and click for the size.
 *
 * Nothing here transacts. The cart lines a bay hands out map onto the
 * same buy actions the cart has always folded through (cart-actions.ts);
 * a shelf is only a place to stand while adding one.
 */

export interface StoreRect {
  readonly min: Vector;
  readonly max: Vector;
}

/** One product as a shelf sells it: its cart line, priced at shelving
 * time so the tag and the register can never disagree. */
export interface ShelfProduct {
  readonly name: string;
  readonly description: string;
  readonly line: CartLine;
}

interface FixtureBase {
  /** Stable across relayouts: what a card or a test finds a shelf by. */
  readonly id: string;
  /** The fixture's solid footprint. */
  readonly rect: StoreRect;
  /** The aisle side it's shopped from — the outward normal of its face. */
  readonly facing: Direction;
}

export interface ShelfBay extends FixtureBase {
  readonly kind: "bay";
  readonly product: ShelfProduct;
  /** The aisle sign this bay hangs under ("Machines", "Tools", …). */
  readonly section: string;
}

export interface LumberRack extends FixtureBase {
  readonly kind: "lumberRack";
  readonly channel: LumberChannel;
}

export interface SheetRack extends FixtureBase {
  readonly kind: "sheetRack";
}

export type StoreFixture = ShelfBay | LumberRack | SheetRack;

/** An aisle's signage, hung over its run. Presentation only. */
export interface AisleSign {
  readonly title: string;
  /** Where the sign hangs, in continuous cell coordinates. */
  readonly at: Vector;
}

export interface StoreLayout {
  readonly store: StoreId;
  /** Wall-to-wall floor, in cells. The front wall is at y = interior[1]. */
  readonly interior: Vector;
  /** The whole walkable world: the floor plus the lot out front. */
  readonly worldSize: Vector;
  /** The door opening's x-span on the front wall. */
  readonly door: { readonly left: number; readonly right: number };
  readonly fixtures: ReadonlyArray<StoreFixture>;
  /** The checkout counter; shopped from its `registerFacing` side. */
  readonly register: StoreRect;
  /** The truck, parked in its stall out front. Nose points +x. */
  readonly truck: StoreRect;
  /** The door band of the parked truck — where E heads home. */
  readonly truckCab: StoreRect;
  /** Where the player stands when the trip arrives: beside the cab. */
  readonly spawn: { readonly cell: Vector; readonly direction: Direction };
  readonly signs: ReadonlyArray<AisleSign>;
}

/** Stud wall thickness, matching the shop's (lot.ts). */
export const STORE_WALL_CELLS = 0.5;

/** How far from a fixture's footprint a cell still counts as standing at
 * it — an arm's reach, the same figure the truck and the stand use. */
export const STORE_REACH = 1.5;

const MACHINE_BAY_WIDTH = 3;
const SMALL_BAY_WIDTH = 2;
const FIXTURE_DEPTH = 1.5;
const RACK_LENGTH = 5;

/** The truck's stall footprint, reusing the lot's real dimensions but
 * parked parallel to the storefront (nose +x). */
const TRUCK_LENGTH_CELLS = 202 / 12;
const TRUCK_WIDTH_CELLS = 66 / 12;

/** Where the doors are along the truck, measured back from the nose in
 * cells — the same door band lot.ts reads off the art. */
const TRUCK_DOOR_NEAR = (160 * 0.36) / 12;
const TRUCK_DOOR_FAR = (320 * 0.36) / 12;

/** Sidewalk kept between the storefront and the parking stall. */
const SIDEWALK_DEPTH = 2.5;
/** Grass/asphalt margin below the stall, so the world doesn't end at
 * the truck's rocker panel. */
const LOT_MARGIN = 1.5;

/**
 * Machines with a price are the ones on the store's shelf. Shop-built
 * furniture (worktables, the storage rack) and the garbage can every
 * shop opens with all cost 0 — the registry's price is the single flag
 * for "sold at the store", so a new machine given a cost lands on a
 * shelf with no store edit.
 */
export function machinesForSale() {
  return Object.values(MACHINE_TYPES).filter((machine) => machine.cost > 0);
}

/** The tool wall's stock: everything not shop-made. */
export function toolsForSale() {
  return Object.values(TOOL_TYPES).filter((tool) => !tool.craftedOnly);
}

/** Bought worktable upgrades — only the vise today. */
export function upgradesForSale() {
  return Object.values(UPGRADE_TYPES).filter((upgrade) => !upgrade.craftedOnly);
}

/** The tool island's products, in walk order: tools, then upgrades, then
 * the one-to-a-shop gear (absent once the shop owns one). */
function islandProducts(gameState: GameState): ShelfProduct[] {
  const products: ShelfProduct[] = toolsForSale().map((tool) => ({
    name: tool.name,
    description: tool.description,
    line: {
      kind: "material",
      material: makeToolItem(tool.id as ToolId),
      price: tool.cost,
    },
  }));
  for (const upgrade of upgradesForSale()) {
    products.push({
      name: upgrade.name,
      description: upgrade.description,
      line: {
        kind: "upgrade",
        upgradeId: upgrade.id as UpgradeId,
        price: upgrade.cost,
      },
    });
  }
  if (!gameState.broomOwned) {
    products.push({
      name: BROOM_NAME,
      description: "A push broom with a dustpan. Sweeps sawdust off the floor.",
      line: { kind: "broom", price: BROOM_COST },
    });
  }
  if (gameState.shopVac === null) {
    products.push({
      name: SHOP_VAC_NAME,
      description:
        "A canister vacuum on casters. Clears sawdust from the floor, including under machines.",
      line: { kind: "shopVac", price: SHOP_VAC_COST },
    });
  }
  return products;
}

/** The supplies run: consumables by the pack, clamps by the bar. */
function suppliesProducts(): ShelfProduct[] {
  const products: ShelfProduct[] = (
    Object.keys(CONSUMABLE_TYPES) as ConsumableId[]
  ).map((id) => {
    const type = CONSUMABLE_TYPES[id];
    return {
      name: type.packName,
      description: `${type.description} ${type.packSize} ${type.unit} per pack.`,
      line: { kind: "consumablePack", consumableId: id, price: type.packPrice },
    };
  });
  products.push({
    name: CLAMP_NAME,
    description: `${CLAMP_DESCRIPTION} Sold one bar at a time.`,
    line: { kind: "clamp", price: CLAMP_COST },
  });
  return products;
}

/**
 * The store's floor plan, generated from what the registries stock and
 * what this save has unlocked. Pure — same state, same floor.
 *
 * Orange Box is the full big box: machines along the back wall, the
 * lumber and sheet racks down the west wall, the tool island in the
 * middle, supplies on the east wall, the register by the doors. Sawyer &
 * Sons runs the same generator with only its lumber channels, which is
 * what keeps the two stores from drifting apart the day the lumberyard
 * becomes walkable too.
 */
export function storeLayout(store: StoreId, gameState: GameState): StoreLayout {
  const fixtures: StoreFixture[] = [];
  const signs: AisleSign[] = [];

  const machines = store === "orangeBox" ? machinesForSale() : [];
  const island = store === "orangeBox" ? islandProducts(gameState) : [];
  const supplies = store === "orangeBox" ? suppliesProducts() : [];
  const channels = unlockedLumberChannels(gameState.reputation, store);
  const sheetKinds =
    store === "orangeBox" ? unlockedSheetSkus(gameState.reputation) : [];

  // ---- Sizing: wide enough for the machine run and the island, tall
  // enough for the west wall's racks, plus the checkout front.
  const machineRunLeft = 4;
  const islandLeft = 5;
  const islandLength =
    Math.ceil(island.length / 2) * SMALL_BAY_WIDTH || SMALL_BAY_WIDTH;
  const width = Math.ceil(
    Math.max(
      machineRunLeft + machines.length * MACHINE_BAY_WIDTH + 1,
      islandLeft + islandLength + 5,
      channels.length > 0 ? 18 : 14,
    ),
  );
  const westRunTop = 4.5;
  const westRunHeight =
    channels.length * (RACK_LENGTH + 1) +
    (sheetKinds.length > 0 ? RACK_LENGTH + 1 : 0);
  const suppliesRunHeight = supplies.length * SMALL_BAY_WIDTH;
  const height = Math.ceil(
    westRunTop + Math.max(westRunHeight, suppliesRunHeight, 11) + 5,
  );

  // ---- Back wall: the machine run, shopped from the south.
  machines.forEach((machine, index) => {
    const x = machineRunLeft + index * MACHINE_BAY_WIDTH;
    fixtures.push({
      kind: "bay",
      id: `machine:${machine.id}`,
      section: "Machines",
      product: {
        name: machine.name,
        description: machine.description,
        line: {
          kind: "machine",
          machineTypeId: machine.id as MachineId,
          price: machine.cost,
        },
      },
      rect: { min: [x, 0], max: [x + MACHINE_BAY_WIDTH, FIXTURE_DEPTH] },
      facing: 3,
    });
  });
  if (machines.length > 0) {
    signs.push({
      title: "Machines",
      at: [machineRunLeft + (machines.length * MACHINE_BAY_WIDTH) / 2, 0.75],
    });
  }

  // ---- West wall: a rack per lumber channel, then the sheet rack.
  let westY = westRunTop;
  for (const channel of channels) {
    fixtures.push({
      kind: "lumberRack",
      id: `lumber:${channel.id}`,
      channel,
      rect: { min: [0, westY], max: [FIXTURE_DEPTH, westY + RACK_LENGTH] },
      facing: 0,
    });
    signs.push({
      title: channel.name,
      at: [FIXTURE_DEPTH / 2 + 1.2, westY - 0.4],
    });
    westY += RACK_LENGTH + 1;
  }
  if (sheetKinds.length > 0) {
    fixtures.push({
      kind: "sheetRack",
      id: "sheetGoods",
      rect: { min: [0, westY], max: [FIXTURE_DEPTH, westY + RACK_LENGTH] },
      facing: 0,
    });
    signs.push({
      title: "Sheet Goods",
      at: [FIXTURE_DEPTH / 2 + 1.2, westY - 0.4],
    });
    westY += RACK_LENGTH + 1;
  }

  // ---- The middle: the tool island, shopped from both long sides.
  const islandTop = 8;
  if (island.length > 0) {
    const perSide = Math.ceil(island.length / 2);
    island.forEach((product, index) => {
      const north = index < perSide;
      const column = north ? index : index - perSide;
      const x = islandLeft + column * SMALL_BAY_WIDTH;
      fixtures.push({
        kind: "bay",
        id: `island:${bayIdForLine(product.line)}`,
        section: "Tools",
        product,
        rect: north
          ? {
              min: [x, islandTop],
              max: [x + SMALL_BAY_WIDTH, islandTop + FIXTURE_DEPTH],
            }
          : {
              min: [x, islandTop + FIXTURE_DEPTH],
              max: [x + SMALL_BAY_WIDTH, islandTop + FIXTURE_DEPTH * 2],
            },
        facing: north ? 1 : 3,
      });
    });
    signs.push({
      title: "Tools",
      at: [islandLeft + islandLength / 2, islandTop + FIXTURE_DEPTH],
    });
  }

  // ---- East wall: the supplies run.
  let eastY = westRunTop;
  for (const product of supplies) {
    fixtures.push({
      kind: "bay",
      id: `supplies:${bayIdForLine(product.line)}`,
      section: "Supplies",
      product,
      rect: {
        min: [width - FIXTURE_DEPTH, eastY],
        max: [width, eastY + SMALL_BAY_WIDTH],
      },
      facing: 2,
    });
    eastY += SMALL_BAY_WIDTH;
  }
  if (supplies.length > 0) {
    signs.push({
      title: "Supplies",
      at: [width - FIXTURE_DEPTH / 2 - 1.2, westRunTop + suppliesRunHeight / 2],
    });
  }

  // ---- The front: doors toward the east end, register beside the lane.
  const doorRight = width - 4;
  const doorLeft = doorRight - 4;
  const register: StoreRect = {
    min: [doorLeft - 5.5, height - 3.5],
    max: [doorLeft - 1.5, height - 2],
  };

  // ---- The lot: sidewalk, then the stall, nose pointing +x.
  const truckTop = height + STORE_WALL_CELLS + SIDEWALK_DEPTH;
  const truckLeft = Math.max(1, (width - TRUCK_LENGTH_CELLS) / 2);
  const truck: StoreRect = {
    min: [truckLeft, truckTop],
    max: [truckLeft + TRUCK_LENGTH_CELLS, truckTop + TRUCK_WIDTH_CELLS],
  };
  const nose = truck.max[0];
  const truckCab: StoreRect = {
    min: [nose - TRUCK_DOOR_FAR, truck.min[1]],
    max: [nose - TRUCK_DOOR_NEAR, truck.max[1]],
  };
  const worldSize: Vector = [width, Math.ceil(truck.max[1] + LOT_MARGIN)];

  // Arriving, you step out of the driver's door onto the sidewalk side.
  const spawn = {
    cell: [
      Math.floor((truckCab.min[0] + truckCab.max[0]) / 2),
      Math.floor(truck.min[1] - 1.2),
    ] as Vector,
    direction: 1 as Direction,
  };

  return {
    store,
    interior: [width, height],
    worldSize,
    door: { left: doorLeft, right: doorRight },
    fixtures,
    register,
    truck,
    truckCab,
    spawn,
    signs,
  };
}

/** A stable shelf id for a product line — ids and prices excluded, so a
 * repriced tool keeps its spot. */
function bayIdForLine(line: CartLine): string {
  switch (line.kind) {
    case "material":
      return line.material.type === "tool"
        ? `tool:${line.material.toolId}`
        : "material";
    case "machine":
      return line.machineTypeId;
    case "consumablePack":
      return line.consumableId;
    case "upgrade":
      return line.upgradeId;
    default:
      return line.kind;
  }
}

/** The walls as solids: full bands on three sides, the front band split
 * by the door opening — the same construction as the shop's (lot.ts). */
export function storeWallSolids(layout: StoreLayout): SolidBox[] {
  const [w, h] = layout.interior;
  const t = STORE_WALL_CELLS;
  const box = (min: Vector, max: Vector): SolidBox => ({
    kind: "box",
    min,
    max,
  });
  return [
    box([-t, -t], [w + t, 0]),
    box([-t, -t], [0, h + t]),
    box([w, -t], [w + t, h + t]),
    box([-t, h], [layout.door.left, h + t]),
    box([layout.door.right, h], [w + t, h + t]),
  ];
}

/** Everything the walking body collides with in the store's world. */
export function storeCollisionWorld(layout: StoreLayout): CollisionWorld {
  const solids: Solid[] = [
    ...storeWallSolids(layout),
    ...layout.fixtures.map((fixture): SolidBox => ({
      kind: "box",
      min: fixture.rect.min,
      max: fixture.rect.max,
    })),
    { kind: "box", min: layout.register.min, max: layout.register.max },
    { kind: "box", min: layout.truck.min, max: layout.truck.max },
  ];
  return { size: layout.worldSize, solids };
}

/** Whether a cell's center is within arm's reach of a rectangle. */
export function withinStoreReach(position: Vector, rect: StoreRect): boolean {
  const cx = position[0] + 0.5;
  const cy = position[1] + 0.5;
  const dx = Math.max(rect.min[0] - cx, 0, cx - rect.max[0]);
  const dy = Math.max(rect.min[1] - cy, 0, cy - rect.max[1]);
  return Math.hypot(dx, dy) <= STORE_REACH;
}

/**
 * The cell in front of a fixture's shopped face — where a helper or a
 * test puts the player to stand at it.
 */
export function fixtureStandCell(fixture: {
  rect: StoreRect;
  facing: Direction;
}): Vector {
  const { rect, facing } = fixture;
  const midX = (rect.min[0] + rect.max[0]) / 2;
  const midY = (rect.min[1] + rect.max[1]) / 2;
  switch (facing) {
    case 0:
      return [Math.floor(rect.max[0] + 1.2), Math.floor(midY)];
    case 2:
      return [Math.floor(rect.min[0] - 1.2), Math.floor(midY)];
    case 1:
      return [Math.floor(midX), Math.floor(rect.min[1] - 1.2)];
    case 3:
      return [Math.floor(midX), Math.floor(rect.max[1] + 1.2)];
  }
}

/** The register's stand cell: on its shopped (north) side. */
export function registerStandCell(layout: StoreLayout): Vector {
  return fixtureStandCell({ rect: layout.register, facing: 1 });
}

/** The cab's stand cell: on the sidewalk beside the driver's door. */
export function cabStandCell(layout: StoreLayout): Vector {
  return layout.spawn.cell;
}
