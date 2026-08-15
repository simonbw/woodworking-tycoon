import { Assets, Container, Graphics, Sprite } from "pixi.js";
import { cellToPixel } from "../../../components/shop-view/shop-scale";
import { TARGET_HIGHLIGHT_FILTERS } from "../../../components/shop-view/targetHighlight";
import { Persistence } from "../../../config/constants";
import { BaseEntity } from "../../../core/entity/BaseEntity";
import { Entity } from "../../../core/entity/Entity";
import { GameSprite } from "../../../core/entity/GameSprite";
import { on } from "../../../core/entity/handler";
import { footprintCenter, Machine, MACHINE_TYPES } from "../../../game/Machine";
import { ProgressionState } from "../../../game/GameState";
import { MaterialInstance } from "../../../game/Materials";
import { ShelfBay, StoreDecor, StoreLayout } from "../../../game/store-layout";
import { Vector } from "../../../game/Vectors";
import { freshMachineState } from "../../../sim/commands/machine-commands";
import {
  BAR_CLAMP_ICON,
  BROOM_ICON,
  consumableIconSrc,
  SHOP_VAC_ICON,
  upgradeIconSrc,
} from "../../../utils/uiImages";
import { drawCrate } from "../../../views/MachineCrateView";
import { createMachineArt } from "../../../views/machine-sprites/create-machine-art";
import { IDLE_ACTIVITY } from "../../../views/machine-sprites/machine-activity";
import { createMaterialSprite } from "../../../views/material-sprites/MaterialSprite";
import { projectGameState } from "../../../sim/projection";
import { ShellStore } from "../../ShellStore";
import { StoreSceneRoot } from "../StoreSceneRoot";

/**
 * The merchandise itself — the old StoreMerchandiseLayer as an entity
 * view, drawn with the same sprites the shop floor uses: boards and
 * sheets piled on the floor at the size they really are, machines as
 * full-size displays, tools laid out on their racking, and the
 * supplies' boxed stock as icon facings. The planogram (store-layout.ts)
 * says where everything stands; this view only decides how a pile of it
 * looks. Everything here is scenery — the piles never enter the sim, so
 * the sprites are built from each bay's own product line (whose
 * material ids are stable for a given layout, which keeps the
 * procedural grain from shimmering between rebuilds).
 *
 * The whole floor's stock bakes once (`cacheAsTexture`) — hundreds of
 * boards' worth of procedural grain rendered live can dominate a frame.
 * The targeting treatment draws the standing bay's stock again over the
 * bake wearing the shop's outline shader, so pointing at a new bay
 * never touches the bake.
 */

/** A resting pile: material, center position (cells), rotation. */
interface MerchPile {
  material: MaterialInstance;
  position: Vector;
  rotation: number;
}

const rectCenter = (rect: ShelfBay["rect"]): Vector => [
  (rect.min[0] + rect.max[0]) / 2,
  (rect.min[1] + rect.max[1]) / 2,
];

/** The piles a lumber bay wears: a row of boards side by side with a
 * couple more on top, long axis pointed at the wall. */
function lumberPiles(bay: ShelfBay): MerchPile[] {
  if (bay.product.line.kind !== "material") return [];
  const material = bay.product.line.material;
  if (material.type !== "board") return [];
  const [cx, cy] = rectCenter(bay.rect);
  const boardWidth = material.width / 12;
  const across = Math.max(2, Math.min(4, Math.floor(1.2 / boardWidth)));
  const piles: MerchPile[] = [];
  for (let i = 0; i < across; i++) {
    const offset = (i - (across - 1) / 2) * (boardWidth + 0.04);
    piles.push({
      material,
      position: [cx, cy + offset],
      rotation: Math.PI / 2,
    });
  }
  // The top layer, set a touch off square so the pile reads as a pile.
  piles.push({
    material,
    position: [cx - 0.08, cy - boardWidth / 2],
    rotation: Math.PI / 2 + 0.02,
  });
  piles.push({
    material,
    position: [cx + 0.1, cy + boardWidth / 2],
    rotation: Math.PI / 2 - 0.015,
  });
  return piles;
}

/** A sheet bay's stack: a few sheets flat on the floor, slightly fanned.
 * The sprite's long axis follows the pile's footprint — the packed
 * panels lie turned lengthwise along their mini-aisles. */
function sheetPiles(bay: ShelfBay): MerchPile[] {
  if (bay.product.line.kind !== "material") return [];
  const material = bay.product.line.material;
  const [cx, cy] = rectCenter(bay.rect);
  const alongX =
    bay.rect.max[0] - bay.rect.min[0] >= bay.rect.max[1] - bay.rect.min[1];
  const base = alongX ? Math.PI / 2 : 0;
  return [
    { material, position: [cx, cy], rotation: base },
    { material, position: [cx + 0.06, cy + 0.05], rotation: base + 0.012 },
    { material, position: [cx - 0.05, cy - 0.04], rotation: base - 0.01 },
  ];
}

/** Tool bays lay a pair of the tool itself out on the racking. */
function toolPiles(bay: ShelfBay): MerchPile[] {
  if (bay.product.line.kind !== "material") return [];
  const material = bay.product.line.material;
  if (material.type !== "tool") return [];
  const [cx, cy] = rectCenter(bay.rect);
  return [
    { material, position: [cx - 0.45, cy], rotation: -0.15 },
    { material, position: [cx + 0.45, cy], rotation: 0.2 },
  ];
}

/** The icon a supply bay racks on its top shelf — the same file the
 * cabinet and the shelf tags draw. Null for lines whose stock has world
 * art instead. */
function supplyIconPath(line: ShelfBay["product"]["line"]): string | null {
  switch (line.kind) {
    case "consumablePack":
      return consumableIconSrc(line.consumableId);
    case "upgrade":
      return upgradeIconSrc(line.upgradeId);
    case "clamp":
      return BAR_CLAMP_ICON;
    case "broom":
      return BROOM_ICON;
    case "shopVac":
      return SHOP_VAC_ICON;
    default:
      return null;
  }
}

/** An icon's size on the racking, in cells. */
const SUPPLY_ICON_CELLS = 1.0;

/** Rotate a footprint-center offset the way the sprite's angle will. */
function rotateOffset([x, y]: Vector, rotation: number): Vector {
  switch (rotation) {
    case 1:
      return [y, -x];
    case 2:
      return [-x, -y];
    case 3:
      return [-y, x];
    default:
      return [x, y];
  }
}

/** The store's tool-stand palette: orange steel frame, laminate top. */
const BENCH_FRAME = 0xe06010;
const BENCH_TOP = 0xcfccc4;

/** The steel display bench a benchtop machine shows on — at counter
 * height, the way the store racks its portable tools. Floor-standing
 * machines stand straight on the slab. */
function drawDisplayBench(g: Graphics, bay: ShelfBay): void {
  const inset = 0.3;
  const x = cellToPixel(bay.rect.min[0] + inset);
  const y = cellToPixel(bay.rect.min[1] + inset);
  const w = cellToPixel(bay.rect.max[0] - bay.rect.min[0] - inset * 2);
  const h = cellToPixel(bay.rect.max[1] - bay.rect.min[1] - inset * 2);
  g.roundRect(x - 2, y - 2, w + 4, h + 4, 5);
  g.fill({ color: 0x000000, alpha: 0.18 });
  g.roundRect(x, y, w, h, 4);
  g.fill(BENCH_FRAME);
  g.roundRect(x + 4, y + 4, w - 8, h - 8, 3);
  g.fill(BENCH_TOP);
}

/** A full-size display model, idle on its pad, turned to face the aisle. */
function buildMachineDisplay(
  bay: ShelfBay,
  progression: ProgressionState,
): Container {
  const container = new Container();
  if (bay.product.line.kind !== "machine") return container;
  const machineTypeId = bay.product.line.machineTypeId;
  // Facing 0 shops from the east, facing 2 from the west; the display
  // turns its working side toward its aisle.
  const rotation = bay.facing === 0 ? 1 : bay.facing === 2 ? 3 : 0;
  const [padX, padY] = rectCenter(bay.rect);
  const [fx, fy] = rotateOffset(
    footprintCenter(MACHINE_TYPES[machineTypeId].cellsOccupied),
    rotation,
  );
  const machine = new Machine({
    ...freshMachineState(machineTypeId, progression),
    // Fractional position centers the art on the pad exactly; only
    // shop machines need to live on the grid.
    position: [padX - 0.5 - fx, padY - 0.5 - fy],
    rotation: rotation as 0 | 1 | 2 | 3,
  });
  if (machine.type.benchtop) {
    const bench = new Graphics();
    drawDisplayBench(bench, bay);
    container.addChild(bench);
  }
  const art = createMachineArt(machine);
  art.rebuild(machine, IDLE_ACTIVITY);
  const [x, y] = [
    cellToPixel(machine.position[0] + 0.5),
    cellToPixel(machine.position[1] + 0.5),
  ];
  art.root.position.set(x, y);
  art.root.angle = machine.rotation * -90;
  container.addChild(art.root);
  return container;
}

/** One bay's stock, drawn at world size — shared between the static
 * merchandise bake and the targeting highlight's live copy. */
function buildBayStock(
  bay: ShelfBay,
  progression: ProgressionState,
): Container {
  if (bay.display === "machine") {
    return buildMachineDisplay(bay, progression);
  }
  const container = new Container();
  const piles =
    bay.display === "lumberStack"
      ? lumberPiles(bay)
      : bay.display === "sheetStack"
        ? sheetPiles(bay)
        : bay.display === "racking"
          ? toolPiles(bay)
          : [];
  for (const pile of piles) {
    const sprite = createMaterialSprite(pile.material);
    sprite.position.set(
      cellToPixel(pile.position[0]),
      cellToPixel(pile.position[1]),
    );
    sprite.rotation = pile.rotation;
    container.addChild(sprite);
  }
  if (bay.display === "racking" && piles.length === 0) {
    const path = supplyIconPath(bay.product.line);
    if (path) {
      const texture = Assets.get(path);
      const [cx, cy] = rectCenter(bay.rect);
      const alongY =
        bay.rect.max[1] - bay.rect.min[1] >= bay.rect.max[0] - bay.rect.min[0];
      const size = cellToPixel(SUPPLY_ICON_CELLS);
      const spread = 0.62;
      for (const offset of [-spread, spread]) {
        const sprite = new Sprite(texture);
        sprite.anchor.set(0.5);
        sprite.position.set(
          cellToPixel(alongY ? cx : cx + offset),
          cellToPixel(alongY ? cy + offset : cy),
        );
        sprite.width = size;
        sprite.height = size;
        container.addChild(sprite);
      }
    }
  }
  return container;
}

/** A stack of boxed stock on the machine run: the same stenciled pine
 * crates a delivery drops on the shop floor, two to a stack. */
function buildCrateStack(decor: StoreDecor): Container {
  const container = new Container();
  const [cx, cy] = rectCenter(decor.rect);
  for (const [dx, dy] of [
    [-0.5, -0.5],
    [-0.28, -0.68],
  ]) {
    const g = new Graphics();
    drawCrate(g);
    g.position.set(cellToPixel(cx + dx + 0.5), cellToPixel(cy + dy + 0.5));
    container.addChild(g);
  }
  return container;
}

export class StoreMerchandiseView extends BaseEntity implements Entity {
  persistenceLevel: number = Persistence.Level;
  pausable = false;

  private baked: Container & GameSprite;
  private highlight: Container & GameSprite;
  private highlightedBayId: string | null = null;
  private drawnVersion = -1;

  constructor(private layout: StoreLayout) {
    super();
    this.baked = new Container() as Container & GameSprite;
    this.baked.layerName = "floorItems";
    this.highlight = new Container() as Container & GameSprite;
    this.highlight.layerName = "floorItems";
    this.highlight.filters = TARGET_HIGHLIGHT_FILTERS;
    this.sprites = [this.baked, this.highlight];
  }

  /** Built on add, not in the constructor: the display models read the
   * shop's progression (it picks each machine's idle operation). */
  @on("add")
  onAdd() {
    const progression = this.progression();
    for (const bay of this.layout.fixtures) {
      this.baked.addChild(buildBayStock(bay, progression));
    }
    for (const item of this.layout.decor) {
      this.baked.addChild(buildCrateStack(item));
    }
    this.baked.cacheAsTexture({ antialias: true });
  }

  private progression(): ProgressionState {
    return projectGameState(this.game).progression;
  }

  @on("render")
  onRender() {
    const store = this.game.entities.tryGetSingleton(ShellStore);
    if (store && store.version === this.drawnVersion) return;
    this.drawnVersion = store?.version ?? -1;

    const scene = this.game.entities.tryGetSingleton(StoreSceneRoot);
    const interact = scene?.checkoutOpen ? null : scene?.interact();
    const bay = interact?.fixture ?? null;
    if ((bay?.id ?? null) === this.highlightedBayId) return;
    this.highlightedBayId = bay?.id ?? null;
    this.highlight.removeChildren().forEach((child) => child.destroy());
    if (bay) {
      this.highlight.addChild(buildBayStock(bay, this.progression()));
    }
  }
}
