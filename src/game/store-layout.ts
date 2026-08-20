import { board } from "./board-helpers";
import { CartLine } from "./cart";
import { CLAMP_COST, CLAMP_DESCRIPTION, CLAMP_NAME } from "./Clamp";
import { CONSUMABLE_TYPES, ConsumableId } from "./Consumable";
import { GameState } from "./GameState";
import { BROOM_COST, BROOM_NAME } from "./HeldTool";
import {
  LumberChannel,
  LumberSku,
  StoreId,
  unlockedLumberChannels,
} from "./lumberStock";
import { MACHINE_TYPES, MachineId } from "./Machine";
import {
  getMaterialName,
  makeMaterial,
  makeToolItem,
  sheetKindLabel,
} from "./material-helpers";
import { LUMBER_CHANNELS } from "./lumberStock";
import { getMaterialFullName } from "./material-helpers";
import { getBoardBuyPrice, getSheetBuyPrice } from "./material-values";
import { SheetGood, Species } from "./Materials";
import { CollisionWorld, Solid, SolidBox } from "./player-motion";
import { SHEET_SIZES, SheetSize, unlockedSheetSkus } from "./sheetStock";
import { SHOP_VAC_COST, SHOP_VAC_NAME } from "./ShopVac";
import { TOOL_TYPES, ToolId } from "./Tool";
import { UPGRADE_TYPES, UpgradeId } from "./Upgrade";
import { Direction, Vector } from "./Vectors";

/**
 * The store as a place: the planogram. A store trip walks a real floor
 * (see docs/trips.md), and this module is the pure geometry of that
 * floor — where the merchandise stands, what each spot sells, where the
 * register and the doors and the parked truck are — in the same units as
 * lot.ts (one cell = one foot, +y toward the street).
 *
 * The floor is laid out in aisles, the way the big box actually shops:
 *
 *   Aisle 1 — lumber on the left (construction first, then hardwoods,
 *             stacked by species then dimension), sheet goods on the
 *             right: full sheets flat on the floor fronting the aisle,
 *             the cut panels packed three deep along mini-aisles that
 *             open off it.
 *   Aisle 2 — machines on both sides, each a full-size display.
 *   Aisle 3 — consumables on both sides.
 *   Back wall — hand tools.
 *
 * Every fixture is a **bay**: one product, E puts one in the cart and F
 * puts one back (see store-interact.ts). A bay's `display` says what the
 * canvas draws there — steel racking, a full-size machine, or the stock
 * itself piled on the floor at the size it really is. Everything with a
 * footprint is solid: merchandise is walked *to*, never through, and a
 * bay is shopped from the aisle side its `facing` names.
 *
 * The layout is generated from the registries rather than hand-placed:
 * lumber piles from LUMBER_CHANNELS, sheet piles from SHEET_SKUS ×
 * SHEET_SIZES, machine displays from MACHINE_TYPES, the tool wall from
 * TOOL_TYPES and UPGRADE_TYPES, the supplies run from CONSUMABLE_TYPES.
 * Adding a product to a registry puts it on the floor with no layout
 * edit here, and a reputation unlock materializes new piles — locked
 * stock is completely absent, per the usual rule about hiding what isn't
 * earned yet.
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

/** What the canvas draws on a bay's footprint: steel racking, a
 * full-size display model, or the stock itself piled on the floor. */
export type BayDisplay = "racking" | "machine" | "lumberStack" | "sheetStack";

export interface ShelfBay {
  readonly kind: "bay";
  /** Stable across relayouts: what a card or a test finds a shelf by. */
  readonly id: string;
  /** The fixture's footprint. */
  readonly rect: StoreRect;
  /** The aisle side it's shopped from — the outward normal of its face. */
  readonly facing: Direction;
  readonly display: BayDisplay;
  readonly product: ShelfProduct;
  /** The aisle section it belongs to ("Machines", "Supplies", …). */
  readonly section: string;
}

export type StoreFixture = ShelfBay;

/** Stencil paint on the concrete: aisle names and wayfinding, drawn on
 * the floor under everything. Presentation only. */
export interface FloorDecal {
  readonly text: string;
  /** Center, in continuous cell coordinates. */
  readonly at: Vector;
  /** Radians; π/2 reads down a north–south aisle. */
  readonly rotation: number;
  /** Cap height, in cells. */
  readonly size: number;
}

/** Scenery with a footprint but no product: today, the crate stacks of
 * boxed machines behind the display models. Solid, like the displays —
 * merchandise is not walked through. */
export interface StoreDecor {
  readonly kind: "crateStack";
  readonly rect: StoreRect;
}

/** One opening in the front wall, as an x-span. */
export interface DoorSpan {
  readonly left: number;
  readonly right: number;
}

export interface StoreLayout {
  readonly store: StoreId;
  /** Wall-to-wall floor, in cells. The front wall is at y = interior[1]. */
  readonly interior: Vector;
  /** The whole walkable world: the floor plus the lot out front. */
  readonly worldSize: Vector;
  /** The two openings in the front wall. The entrance stands nearer the
   * east end; the exit lane passes the register on the way out. */
  readonly doors: { readonly entrance: DoorSpan; readonly exit: DoorSpan };
  readonly fixtures: ReadonlyArray<StoreFixture>;
  /** The gondola spines: interior walls between back-to-back runs, so
   * an aisle reads as an aisle instead of merchandise floating in a
   * warehouse. Solid, like the perimeter walls. */
  readonly spines: ReadonlyArray<StoreRect>;
  /** The checkout counter; shopped from its north side. */
  readonly register: StoreRect;
  /** The cart corral just inside the entrance: the nested flatbeds a
   * trip takes its cart from before the shelves will load one. */
  readonly corral: StoreRect;
  /** The truck, parked in its stall out front. Nose points +x. */
  readonly truck: StoreRect;
  /** The door band of the parked truck — where E heads home. */
  readonly truckCab: StoreRect;
  /** Where the player stands when the trip arrives: beside the cab. */
  readonly spawn: { readonly cell: Vector; readonly direction: Direction };
  readonly decals: ReadonlyArray<FloorDecal>;
  readonly decor: ReadonlyArray<StoreDecor>;
}

/** Stud wall thickness, matching the shop's (lot.ts). */
export const STORE_WALL_CELLS = 0.5;

/** How far from a fixture's footprint a cell still counts as standing at
 * it — an arm's reach, the same figure the truck and the stand use. */
export const STORE_REACH = 1.5;

// ---- The floor's bones: three aisles between four merchandise bands.
// All in cells (feet), west to east.

/** The lumber band's depth — an 8' board pointed at the west wall. */
const LUMBER_DEPTH = 8;
/** How much aisle a lumber pile takes, side to side. */
const LUMBER_SLOT = 1.4;
/** The sheet band's depth — a full sheet pointed away from aisle 1. */
const SHEET_DEPTH = 8.5;
/** A machine display's footprint — every machine for sale fits 3×3. */
const MACHINE_PAD = 3;
/** A crate stack's footprint on the machine run — display stock boxed
 * behind the floor models. */
const CRATE_STACK = 1.8;
/** Steel racking depth for the tool wall and the supplies runs. */
const FIXTURE_DEPTH = 1.5;
/** A tool bay's width along the back wall. */
const TOOL_BAY_WIDTH = 2;
/** A supplies bay's height along its aisle. */
const SUPPLY_BAY_HEIGHT = 2.75;
/** Walking room between the bands — wide enough for a cart to pass a
 * browsing shopper without brushing either run. */
const AISLE_WIDTH = 5;
/** A mini-aisle in the sheet band: the walking slot the packed panel
 * piles are shopped from. */
const MINI_AISLE = 2.5;
/** A gondola spine's thickness. */
const SPINE_WIDTH = 0.75;
/** The cross-aisle between the tool wall and the tops of the runs. */
const BACK_CROSS_AISLE = 3;
/** The front of the store: cross-aisle, register, doors. */
const FRONT_ZONE = 6.5;

const LUMBER_BAND_LEFT = 0;
const AISLE_1_LEFT = LUMBER_BAND_LEFT + LUMBER_DEPTH;
const SHEET_BAND_LEFT = AISLE_1_LEFT + AISLE_WIDTH;
const SPINE_A_LEFT = SHEET_BAND_LEFT + SHEET_DEPTH;
const MACHINE_WEST_LEFT = SPINE_A_LEFT + SPINE_WIDTH;
const AISLE_2_LEFT = MACHINE_WEST_LEFT + MACHINE_PAD;
const MACHINE_EAST_LEFT = AISLE_2_LEFT + AISLE_WIDTH;
const SPINE_B_LEFT = MACHINE_EAST_LEFT + MACHINE_PAD;
const SUPPLY_WEST_LEFT = SPINE_B_LEFT + SPINE_WIDTH;
const AISLE_3_LEFT = SUPPLY_WEST_LEFT + FIXTURE_DEPTH;
const SUPPLY_EAST_LEFT = AISLE_3_LEFT + AISLE_WIDTH;
const INTERIOR_WIDTH = SUPPLY_EAST_LEFT + FIXTURE_DEPTH;

/** One item of a run: its extent along the run, the air it wants between
 * itself and the item in front of it, and whether that gap is a seam the
 * run's leftover slack may widen. Gaps inside a group stay put. */
interface RunItem {
  readonly size: number;
  readonly gapBefore: number;
  readonly stretch?: boolean;
}

/**
 * Lay a run front to back: each item keeps its preferred gap, and
 * whatever span is left over pads the stretchable gaps (the seams
 * between groups) equally — a species' piles stay shoulder to shoulder
 * while the seams between groups take up the slack. Items are given
 * front-first; returns each one's min coordinate.
 */
function layRun(
  items: ReadonlyArray<RunItem>,
  top: number,
  bottom: number,
): number[] {
  const natural = items.reduce(
    (sum, item) => sum + item.size + item.gapBefore,
    0,
  );
  const seams = items.filter((item) => item.stretch !== false).length;
  const pad = Math.max(0, (bottom - top - natural) / (seams + 1));
  let edge = bottom;
  return items.map((item) => {
    edge -= item.gapBefore + (item.stretch !== false ? pad : 0) + item.size;
    return edge;
  });
}

/** The natural length a run of items wants, gaps included. */
function runNatural(items: ReadonlyArray<RunItem>): number {
  return items.reduce((sum, item) => sum + item.size + item.gapBefore, 0);
}

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
 * Machines with a price are the ones on the store's floor. Shop-built
 * furniture (worktables, the storage rack) and the garbage can every
 * shop opens with all cost 0 — the registry's price is the single flag
 * for "sold at the store", so a new machine given a cost lands on a
 * display pad with no store edit.
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

/** The tool wall's products, in walk order: tools, then upgrades, then
 * the one-to-a-shop gear (absent once the shop owns one). */
function toolWallProducts(gameState: GameState): ShelfProduct[] {
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

/** The board a lumber pile sells, exactly as the channel racks it. */
export function channelBoard(
  channel: LumberChannel,
  species: Species,
  sku: LumberSku,
) {
  return board(species, sku.length, sku.width, sku.thickness, channel.surface, {
    faces: channel.jointedFaces,
    edges: channel.jointedEdges,
  });
}

/** The sheet a floor pile sells. */
export function pileSheet(
  kind: SheetGood["kind"],
  thickness: SheetGood["thickness"],
  size: SheetSize,
): SheetGood {
  return makeMaterial<SheetGood>({
    type: "plywood",
    kind,
    length: size.length,
    width: size.width,
    thickness,
  });
}

/**
 * The store's floor plan, generated from what the registries stock and
 * what this save has unlocked. Pure — same state, same floor.
 *
 * The runs hang from the front cross-aisle: walking into an aisle from
 * the doors, the first group is the first thing you pass ("first
 * construction, then hardwoods"), and deeper stock sits toward the back
 * wall. The sheet band is the longest run in the building and sets the
 * pace; the other bands fill that same span with duplicate facings, and
 * a band that would overflow it sheds its duplicates instead. Sawyer &
 * Sons runs the same generator with only its lumber channels, which is
 * what keeps the two stores from drifting apart the day the lumberyard
 * becomes walkable too.
 */
export function storeLayout(store: StoreId, gameState: GameState): StoreLayout {
  const fixtures: StoreFixture[] = [];
  const decals: FloorDecal[] = [];
  const decor: StoreDecor[] = [];

  const machines = store === "orangeBox" ? machinesForSale() : [];
  const tools = store === "orangeBox" ? toolWallProducts(gameState) : [];
  const supplies = store === "orangeBox" ? suppliesProducts() : [];
  const channels = unlockedLumberChannels(gameState.reputation, store);
  const sheetKinds =
    store === "orangeBox" ? unlockedSheetSkus(gameState.reputation) : [];

  // ---- The sheet band's plan, front to back: full sheets in one row
  // fronting the aisle, then the cut panels turned lengthwise and packed
  // three deep along mini-aisles — a third the run the same piles took
  // in one row, every pile still a straight walk from a corridor.
  const fullSize = SHEET_SIZES.find((size) => size.id === "full");
  const panelSizes = SHEET_SIZES.filter((size) => size.id !== "full");
  const fullRun = fullSize
    ? sheetKinds.map((sku, index) => ({
        sku,
        size: fullSize,
        item: {
          size: fullSize.width / 12,
          gapBefore: index === 0 ? 0 : 0.35,
        } satisfies RunItem,
      }))
    : [];
  // A panel block: columns of up to three piles flanking one mini-aisle.
  // Its run length is what the band's budget charges for it.
  const panelBlockLength = (count: number, pileRun: number): number => {
    if (count === 0) return 0;
    const rows = Math.ceil(count / 3);
    const pairs = Math.ceil(rows / 2);
    return pairs * (MINI_AISLE + 2 * pileRun) - (rows % 2 === 1 ? pileRun : 0);
  };
  const sheetNatural =
    runNatural(fullRun.map((entry) => entry.item)) +
    panelSizes.reduce(
      (sum, size) =>
        sum +
        (sheetKinds.length > 0
          ? panelBlockLength(sheetKinds.length, size.length / 12) + 0.8
          : 0),
      0,
    );

  // ---- The lumber run: piles by channel, species, then dimension, and
  // as many copies of each pile as fit the span without crowding it.
  const lumberSkus = channels.flatMap((channel, channelIndex) =>
    channel.species.flatMap((species, speciesIndex) =>
      channel.skus.map((sku, skuIndex) => ({
        channel,
        species,
        sku,
        newSpecies: skuIndex === 0,
        newChannel: speciesIndex === 0 && skuIndex === 0 && channelIndex > 0,
      })),
    ),
  );
  const lumberRunFor = (copies: number): RunItem[] =>
    lumberSkus.flatMap((entry, index) =>
      Array.from({ length: copies }, (_, copyIndex) => ({
        size: LUMBER_SLOT,
        // Copies sit shoulder to shoulder; dimensions of one species
        // stay grouped; only the species and channel seams stretch.
        gapBefore:
          copyIndex > 0
            ? 0.15
            : entry.newChannel
              ? 1.8
              : entry.newSpecies && index > 0
                ? 1.0
                : index > 0
                  ? 0.4
                  : 0,
        stretch: copyIndex === 0 && (entry.newSpecies || index === 0),
      })),
    );

  const runTop = FIXTURE_DEPTH + BACK_CROSS_AISLE;
  const targetRun = Math.max(sheetNatural, runNatural(lumberRunFor(1)), 14);
  const frontier = runTop + targetRun;
  const width = INTERIOR_WIDTH;
  const height = Math.ceil(frontier + FRONT_ZONE);

  // ---- Back wall: the tool wall, spread across the whole wall.
  const toolMins = layRun(
    tools.map((_, index) => ({
      size: TOOL_BAY_WIDTH,
      gapBefore: index === 0 ? 0 : 0.4,
    })),
    1.5,
    width - 1.5,
  );
  tools.forEach((product, index) => {
    // layRun hands out positions from its far end; walk order reads
    // west to east.
    const x = toolMins[tools.length - 1 - index];
    fixtures.push({
      kind: "bay",
      id: `wall:${bayIdForLine(product.line)}`,
      section: "Tools",
      display: "racking",
      product,
      rect: { min: [x, 0], max: [x + TOOL_BAY_WIDTH, FIXTURE_DEPTH] },
      facing: 3,
    });
  });

  // ---- Aisle 1 west: the lumber piles, boards pointed at the west
  // wall so every pile meets the aisle end-on.
  let lumberCopies = 3;
  while (
    lumberCopies > 1 &&
    runNatural(lumberRunFor(lumberCopies)) > targetRun
  ) {
    lumberCopies--;
  }
  const lumberItems = lumberSkus.flatMap((entry) =>
    Array.from({ length: lumberCopies }, (_, copyIndex) => ({
      ...entry,
      copy: copyIndex + 1,
    })),
  );
  const lumberMins = layRun(lumberRunFor(lumberCopies), runTop, frontier);
  lumberItems.forEach((entry, index) => {
    const { channel, species, sku } = entry;
    const pileLength = sku.length / 12;
    const min = lumberMins[index];
    const material = channelBoard(channel, species, sku);
    const baseId = `lumber:${channel.id}:${species}:${sku.thickness}x${sku.width}x${sku.length}`;
    fixtures.push({
      kind: "bay",
      id: entry.copy === 1 ? baseId : `${baseId}:${entry.copy}`,
      section: channel.name,
      display: "lumberStack",
      product: {
        name: getMaterialName(material),
        description: channel.tagline,
        line: {
          kind: "material",
          material,
          price: getBoardBuyPrice(material, channel.priceMultiplier),
        },
      },
      rect: {
        min: [AISLE_1_LEFT - pileLength, min],
        max: [AISLE_1_LEFT, min + LUMBER_SLOT],
      },
      facing: 0,
    });
  });

  // ---- Aisle 1 east: the sheet band, walking in from the doors —
  // full sheets first, then the panel blocks, smaller sizes deeper.
  const sheetBay = (
    sku: (typeof sheetKinds)[number],
    size: SheetSize,
    rect: StoreRect,
    facing: Direction,
  ) => {
    const material = pileSheet(sku.kind, sku.thickness, size);
    fixtures.push({
      kind: "bay",
      id: `sheet:${sku.kind}:${size.id}`,
      section: "Sheet Goods",
      display: "sheetStack",
      product: {
        name: `${sheetKindLabel(sku.kind)} — ${size.label}`,
        description: sku.tagline,
        line: {
          kind: "material",
          material,
          price: getSheetBuyPrice(material),
        },
      },
      rect,
      facing,
    });
  };
  if (sheetKinds.length > 0 && fullSize) {
    // The panel blocks hang from the back; whatever the band's share of
    // the run leaves over, the full-sheet row spreads across.
    let cursor = runTop;
    for (const size of [...panelSizes].reverse()) {
      const pileRun = size.length / 12;
      const pileDepth = size.width / 12;
      // Columns of three piles flank each mini-aisle, every pile shopped
      // across the corridor it touches.
      sheetKinds.forEach((sku, index) => {
        const row = Math.floor(index / 3);
        const column = index % 3;
        const pair = Math.floor(row / 2);
        const nearSide = row % 2 === 0;
        const blockTop = cursor + pair * (2 * pileRun + MINI_AISLE);
        const top = nearSide ? blockTop : blockTop + pileRun + MINI_AISLE;
        const left = SHEET_BAND_LEFT + column * (pileDepth + 0.3);
        sheetBay(
          sku,
          size,
          {
            min: [left, top],
            max: [left + pileDepth, top + pileRun],
          },
          // Shopped across the mini-aisle: the near row from its south
          // side, the far row from its north.
          nearSide ? 3 : 1,
        );
      });
      cursor += panelBlockLength(sheetKinds.length, pileRun) + 0.8;
    }
    const fullMins = layRun(
      fullRun.map((entry) => entry.item),
      cursor,
      frontier,
    );
    fullRun.forEach((entry, index) => {
      sheetBay(
        entry.sku,
        entry.size,
        {
          min: [SHEET_BAND_LEFT, fullMins[index]],
          max: [
            SHEET_BAND_LEFT + entry.size.length / 12,
            fullMins[index] + entry.size.width / 12,
          ],
        },
        2,
      );
    });
  }

  // ---- Aisle 2: the machines. Each floor model shows with its boxed
  // stock crated up beside it — twice over when the run has room.
  const placeMachines = (
    run: ReturnType<typeof machinesForSale>,
    left: number,
    facing: Direction,
  ) => {
    if (run.length === 0) return;
    type MachineRunItem = RunItem &
      (
        | { kind: "machine"; machine: (typeof run)[number]; copy: number }
        | { kind: "crates" }
      );
    const itemsFor = (copies: number, crates: boolean): MachineRunItem[] =>
      run.flatMap((machine, index) => {
        const group: MachineRunItem[] = [
          {
            kind: "machine",
            machine,
            copy: 1,
            size: MACHINE_PAD,
            gapBefore: index === 0 ? 0 : 1.1,
            stretch: index > 0,
          },
        ];
        if (crates) {
          group.push({
            kind: "crates",
            size: CRATE_STACK,
            gapBefore: 0.5,
            stretch: false,
          });
        }
        if (copies > 1) {
          group.push({
            kind: "machine",
            machine,
            copy: 2,
            size: MACHINE_PAD,
            gapBefore: 0.5,
            stretch: false,
          });
          if (crates) {
            group.push({
              kind: "crates",
              size: CRATE_STACK,
              gapBefore: 0.5,
              stretch: false,
            });
          }
        }
        return group;
      });
    // The fullest arrangement the span holds: doubled displays with
    // crated stock, thinning down rather than spilling past the run.
    const items =
      [itemsFor(2, true), itemsFor(1, true), itemsFor(1, false)].find(
        (candidate) => runNatural(candidate) <= targetRun,
      ) ?? itemsFor(1, false);
    const mins = layRun(items, runTop, frontier);
    items.forEach((item, index) => {
      if (item.kind === "crates") {
        const inset = (MACHINE_PAD - CRATE_STACK) / 2;
        decor.push({
          kind: "crateStack",
          rect: {
            min: [left + inset, mins[index]],
            max: [left + inset + CRATE_STACK, mins[index] + CRATE_STACK],
          },
        });
        return;
      }
      fixtures.push({
        kind: "bay",
        id:
          item.copy === 1
            ? `machine:${item.machine.id}`
            : `machine:${item.machine.id}:${item.copy}`,
        section: "Machines",
        display: "machine",
        product: {
          name: item.machine.name,
          description: item.machine.description,
          line: {
            kind: "machine",
            machineTypeId: item.machine.id as MachineId,
            price: item.machine.cost,
          },
        },
        rect: {
          min: [left, mins[index]],
          max: [left + MACHINE_PAD, mins[index] + MACHINE_PAD],
        },
        facing,
      });
    });
  };
  const machinesWest = machines.slice(0, Math.ceil(machines.length / 2));
  const machinesEast = machines.slice(machinesWest.length);
  placeMachines(machinesWest, MACHINE_WEST_LEFT, 0);
  placeMachines(machinesEast, MACHINE_EAST_LEFT, 2);

  // ---- Aisle 3: the supplies runs on both sides. A few products fill
  // a whole aisle the way a real planogram does: duplicate facings,
  // grouped, until the run is stocked end to end.
  const placeSupplies = (
    run: ShelfProduct[],
    left: number,
    facing: Direction,
  ) => {
    if (run.length === 0) return;
    const bayCount = Math.max(
      run.length,
      Math.floor(targetRun / (SUPPLY_BAY_HEIGHT + 0.6)),
    );
    const perProduct = run.map(
      (_, index) =>
        Math.floor(bayCount / run.length) +
        (index < bayCount % run.length ? 1 : 0),
    );
    const sequence = run.flatMap((product, index) =>
      Array<ShelfProduct>(perProduct[index]).fill(product),
    );
    const seen = new Map<string, number>();
    const mins = layRun(
      sequence.map((product, index) => ({
        size: SUPPLY_BAY_HEIGHT,
        gapBefore:
          index === 0 ? 0 : sequence[index - 1] === product ? 0.3 : 1.2,
        stretch: index === 0 || sequence[index - 1] !== product,
      })),
      runTop,
      frontier,
    );
    sequence.forEach((product, index) => {
      const base = `supplies:${bayIdForLine(product.line)}`;
      const nth = (seen.get(base) ?? 0) + 1;
      seen.set(base, nth);
      fixtures.push({
        kind: "bay",
        id: nth === 1 ? base : `${base}:${nth}`,
        section: "Supplies",
        display: "racking",
        product,
        rect: {
          min: [left, mins[index]],
          max: [left + FIXTURE_DEPTH, mins[index] + SUPPLY_BAY_HEIGHT],
        },
        facing,
      });
    });
  };
  const suppliesWest = supplies.slice(0, Math.ceil(supplies.length / 2));
  const suppliesEast = supplies.slice(suppliesWest.length);
  placeSupplies(suppliesWest, SUPPLY_WEST_LEFT, 0);
  placeSupplies(suppliesEast, SUPPLY_EAST_LEFT, 2);

  // ---- The gondola spines between back-to-back runs.
  const spines: StoreRect[] =
    store === "orangeBox"
      ? [
          {
            min: [SPINE_A_LEFT, runTop],
            max: [SPINE_A_LEFT + SPINE_WIDTH, frontier],
          },
          {
            min: [SPINE_B_LEFT, runTop],
            max: [SPINE_B_LEFT + SPINE_WIDTH, frontier],
          },
        ]
      : [];

  // ---- The front: the entrance toward the east end, the exit lane
  // past the register — walking out is walking past the counter.
  const entrance: DoorSpan = { left: width - 8, right: width - 4 };
  const exit: DoorSpan = { left: width - 19, right: width - 15 };
  const register: StoreRect = {
    min: [exit.right + 1.5, height - 3.5],
    max: [exit.right + 5.5, height - 2],
  };
  // The corral of nested flatbeds, tucked against the front wall just
  // inside the entrance — the first stop of every trip.
  const corral: StoreRect = {
    min: [width - 3.4, height - 2.3],
    max: [width - 0.8, height - 0.8],
  };

  // ---- Stencil paint on the concrete: each aisle names itself down
  // its own floor, and the doors say which way they swing.
  if (store === "orangeBox") {
    const midRun = frontier - targetRun / 2;
    if (lumberSkus.length > 0) {
      decals.push({
        text: "LUMBER",
        at: [AISLE_1_LEFT + 1.4, midRun],
        rotation: Math.PI / 2,
        size: 1.5,
      });
    }
    if (sheetKinds.length > 0) {
      decals.push({
        text: "SHEET GOODS",
        at: [SHEET_BAND_LEFT - 1.4, midRun],
        rotation: Math.PI / 2,
        size: 1.5,
      });
    }
    if (machines.length > 0) {
      decals.push({
        text: "MACHINES",
        at: [AISLE_2_LEFT + AISLE_WIDTH / 2, midRun],
        rotation: Math.PI / 2,
        size: 1.8,
      });
    }
    if (supplies.length > 0) {
      decals.push({
        text: "SUPPLIES",
        at: [AISLE_3_LEFT + AISLE_WIDTH / 2, midRun],
        rotation: Math.PI / 2,
        size: 1.8,
      });
    }
    if (tools.length > 0) {
      decals.push({
        text: "TOOLS",
        at: [width / 2, runTop - BACK_CROSS_AISLE / 2],
        rotation: 0,
        size: 1.3,
      });
    }
    decals.push({
      text: "CHECKOUT",
      at: [(register.min[0] + register.max[0]) / 2, register.min[1] - 1.3],
      rotation: 0,
      size: 0.9,
    });
    decals.push({
      text: "ENTRANCE",
      at: [(entrance.left + entrance.right) / 2, height - 1.4],
      rotation: 0,
      size: 0.7,
    });
    decals.push({
      text: "EXIT",
      at: [(exit.left + exit.right) / 2, height - 1.4],
      rotation: 0,
      size: 0.7,
    });
    decals.push({
      text: "CARTS",
      at: [(corral.min[0] + corral.max[0]) / 2, corral.min[1] - 0.9],
      rotation: 0,
      size: 0.55,
    });
  }

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
    doors: { entrance, exit },
    fixtures,
    spines,
    register,
    corral,
    truck,
    truckCab,
    spawn,
    decals,
    decor,
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
 * by the two door openings — the same construction as the shop's
 * (lot.ts). */
export function storeWallSolids(layout: StoreLayout): SolidBox[] {
  const [w, h] = layout.interior;
  const t = STORE_WALL_CELLS;
  const { entrance, exit } = layout.doors;
  const box = (min: Vector, max: Vector): SolidBox => ({
    kind: "box",
    min,
    max,
  });
  return [
    box([-t, -t], [w + t, 0]),
    box([-t, -t], [0, h + t]),
    box([w, -t], [w + t, h + t]),
    box([-t, h], [exit.left, h + t]),
    box([exit.right, h], [entrance.left, h + t]),
    box([entrance.right, h], [w + t, h + t]),
  ];
}

/** Everything the walking body collides with in the store's world. The
 * merchandise itself is solid — a pile of sheets is walked to, not
 * through — along with the racking, the displays, the crated stock, the
 * spines, the register, and the truck. */
export function storeCollisionWorld(layout: StoreLayout): CollisionWorld {
  const solids: Solid[] = [
    ...storeWallSolids(layout),
    ...layout.fixtures.map((fixture): SolidBox => ({
      kind: "box",
      min: fixture.rect.min,
      max: fixture.rect.max,
    })),
    ...layout.decor.map((item): SolidBox => ({
      kind: "box",
      min: item.rect.min,
      max: item.rect.max,
    })),
    ...layout.spines.map((spine): SolidBox => ({
      kind: "box",
      min: spine.min,
      max: spine.max,
    })),
    { kind: "box", min: layout.register.min, max: layout.register.max },
    { kind: "box", min: layout.corral.min, max: layout.corral.max },
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

/** The nearest cell whose center clears `edge` on the given side — where
 * a body stands against a solid fixture's face. */
function cellBeside(edge: number, side: 1 | -1): number {
  return side > 0 ? Math.ceil(edge - 1e-6) : Math.floor(edge - 1 + 1e-6);
}

/**
 * The cell to stand on to shop a fixture — where a helper or a test
 * puts the player: in front of the shopped face, a step into its aisle.
 */
export function fixtureStandCell(fixture: {
  rect: StoreRect;
  facing: Direction;
}): Vector {
  const { rect, facing } = fixture;
  const midX = Math.floor((rect.min[0] + rect.max[0]) / 2);
  const midY = Math.floor((rect.min[1] + rect.max[1]) / 2);
  switch (facing) {
    case 0:
      return [cellBeside(rect.max[0], 1), midY];
    case 2:
      return [cellBeside(rect.min[0], -1), midY];
    case 1:
      return [midX, cellBeside(rect.min[1], -1)];
    case 3:
      return [midX, cellBeside(rect.max[1], 1)];
  }
}

/** The register's stand cell: on its shopped (north) side. */
export function registerStandCell(layout: StoreLayout): Vector {
  return fixtureStandCell({ rect: layout.register, facing: 1 });
}

/** The corral's stand cell: in front of the nested flatbeds. */
export function corralStandCell(layout: StoreLayout): Vector {
  return fixtureStandCell({ rect: layout.corral, facing: 1 });
}

/** The cab's stand cell: on the sidewalk beside the driver's door. */
export function cabStandCell(layout: StoreLayout): Vector {
  return layout.spawn.cell;
}

/**
 * Find the shelf a product hangs on, by the name printed on its tag —
 * the same names the Add-to-cart buttons carry, so a spec that shopped
 * the old overlay finds the same product on the new floor. Category
 * names still answer too: a channel's name finds its first pile, "Sheet
 * Goods" the first sheet pile, and a sheet kind its full-size pile.
 */
export function findShelf(
  layout: StoreLayout,
  product: string,
): { kind: "bay"; id: string; cell: Vector } | null {
  const found = (fixture: ShelfBay | undefined) =>
    fixture
      ? {
          kind: "bay" as const,
          id: fixture.id,
          cell: fixtureStandCell(fixture),
        }
      : null;

  for (const fixture of layout.fixtures) {
    if (fixture.product.name === product) {
      return found(fixture);
    }
  }
  for (const fixture of layout.fixtures) {
    const line = fixture.product.line;
    if (
      line.kind === "material" &&
      getMaterialFullName(line.material) === product
    ) {
      return found(fixture);
    }
  }
  // A lumber channel's name finds the front pile of its group.
  const channel = LUMBER_CHANNELS.find(
    (candidate) => candidate.name === product,
  );
  if (channel) {
    return found(
      layout.fixtures.find((fixture) =>
        fixture.id.startsWith(`lumber:${channel.id}:`),
      ),
    );
  }
  if (product === "Sheet Goods") {
    return found(
      layout.fixtures.find((fixture) => fixture.id.startsWith("sheet:")),
    );
  }
  // A sheet kind alone ("Shop Plywood") finds its full-sheet pile.
  return found(
    layout.fixtures.find(
      (fixture) =>
        fixture.id.startsWith("sheet:") &&
        fixture.product.name.startsWith(`${product} — `),
    ),
  );
}
