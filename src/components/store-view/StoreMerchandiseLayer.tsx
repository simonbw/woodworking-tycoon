import type { Container } from "pixi.js";
import { Graphics } from "pixi.js";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { freshMachineState } from "../../game/game-actions/machine-actions";
import { MaterialPile } from "../../game/GameState";
import { Machine, MACHINE_TYPES, footprintCenter } from "../../game/Machine";
import { MaterialInstance } from "../../game/Materials";
import { ShelfBay, StoreDecor, StoreLayout } from "../../game/store-layout";
import { Vector } from "../../game/Vectors";
import { MachineCrateSprite } from "../shop-view/MachineCrateSprite";
import { MachineSprite } from "../shop-view/MachineSprite";
import { MaterialPileSprite } from "../shop-view/MaterialPileSprite";
import { cellToPixel } from "../shop-view/shop-scale";
import { TARGET_HIGHLIGHT_FILTERS } from "../shop-view/targetHighlight";
import {
  BAR_CLAMP_ICON,
  BROOM_ICON,
  SHOP_VAC_ICON,
  consumableIconSrc,
  upgradeIconSrc,
} from "../../utils/uiImages";
import { useTexture } from "../../utils/useTexture";
import { useGameState } from "../useGameState";

/**
 * The merchandise itself, drawn with the same sprites the shop floor
 * uses: boards and sheets piled on the floor at the size they really
 * are, machines as full-size displays, tools laid out on their racking,
 * and the supplies' boxed stock visible on the shelf tops. The planogram
 * (store-layout.ts) says where everything stands; this layer only
 * decides how a pile of it looks.
 *
 * Everything here is scenery — the piles never enter GameState, so the
 * sprites are built from each bay's own product line (whose material ids
 * are stable for a given layout, which keeps the procedural grain from
 * shimmering between renders).
 */

/** A resting pile: material, center position (cells), rotation. */
function pile(
  material: MaterialInstance,
  position: Vector,
  rotation: number,
): MaterialPile {
  return { material, position, rotation };
}

const rectCenter = (rect: ShelfBay["rect"]): Vector => [
  (rect.min[0] + rect.max[0]) / 2,
  (rect.min[1] + rect.max[1]) / 2,
];

/** The piles a lumber bay wears: a row of boards side by side with a
 * couple more on top, long axis pointed at the wall. */
function lumberPiles(bay: ShelfBay): MaterialPile[] {
  if (bay.product.line.kind !== "material") return [];
  const material = bay.product.line.material;
  if (material.type !== "board") return [];
  const [cx, cy] = rectCenter(bay.rect);
  const boardWidth = material.width / 12;
  const across = Math.max(2, Math.min(4, Math.floor(1.2 / boardWidth)));
  const piles: MaterialPile[] = [];
  for (let i = 0; i < across; i++) {
    const offset = (i - (across - 1) / 2) * (boardWidth + 0.04);
    piles.push(pile(material, [cx, cy + offset], Math.PI / 2));
  }
  // The top layer, set a touch off square so the pile reads as a pile.
  piles.push(
    pile(material, [cx - 0.08, cy - boardWidth / 2], Math.PI / 2 + 0.02),
  );
  piles.push(
    pile(material, [cx + 0.1, cy + boardWidth / 2], Math.PI / 2 - 0.015),
  );
  return piles;
}

/** A sheet bay's stack: a few sheets flat on the floor, slightly fanned.
 * The sprite's long axis follows the pile's footprint — the packed
 * panels lie turned lengthwise along their mini-aisles. */
function sheetPiles(bay: ShelfBay): MaterialPile[] {
  if (bay.product.line.kind !== "material") return [];
  const material = bay.product.line.material;
  const [cx, cy] = rectCenter(bay.rect);
  const alongX =
    bay.rect.max[0] - bay.rect.min[0] >= bay.rect.max[1] - bay.rect.min[1];
  const base = alongX ? Math.PI / 2 : 0;
  return [
    pile(material, [cx, cy], base),
    pile(material, [cx + 0.06, cy + 0.05], base + 0.012),
    pile(material, [cx - 0.05, cy - 0.04], base - 0.01),
  ];
}

/** Tool bays lay a pair of the tool itself out on the racking. */
function toolPiles(bay: ShelfBay): MaterialPile[] {
  if (bay.product.line.kind !== "material") return [];
  const material = bay.product.line.material;
  if (material.type !== "tool") return [];
  const [cx, cy] = rectCenter(bay.rect);
  return [
    pile(material, [cx - 0.45, cy], -0.15),
    pile(material, [cx + 0.45, cy], 0.2),
  ];
}

/** The icon a supply bay racks on its top shelf — the same file the
 * cabinet and the shelf tags draw, so the thing on the racking is the
 * thing that lands in the shop. Null for lines whose stock has world
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

/** A supply bay's stock: a couple of duplicate facings of the product's
 * icon along the shelf, the way the cabinet at home draws it. */
const SupplyIconStock: React.FC<{ bay: ShelfBay; path: string }> = ({
  bay,
  path,
}) => {
  const texture = useTexture(path);
  const [cx, cy] = rectCenter(bay.rect);
  const alongY =
    bay.rect.max[1] - bay.rect.min[1] >= bay.rect.max[0] - bay.rect.min[0];
  const size = cellToPixel(SUPPLY_ICON_CELLS);
  const spread = 0.62;
  return (
    <>
      {[-spread, spread].map((offset) => (
        <pixiSprite
          key={offset}
          texture={texture}
          anchor={0.5}
          x={cellToPixel(alongY ? cx : cx + offset)}
          y={cellToPixel(alongY ? cy + offset : cy)}
          width={size}
          height={size}
        />
      ))}
    </>
  );
};

/** A stack of boxed stock on the machine run: the same stenciled pine
 * crates a delivery drops on the shop floor, two to a stack. */
const CrateStack: React.FC<{ decor: StoreDecor }> = ({ decor }) => {
  const gameState = useGameState();
  const crates = useMemo(() => {
    const [cx, cy] = rectCenter(decor.rect);
    // The sprite draws centered on its cell's center; the machine inside
    // is never read for drawing, so any type will do.
    const machine = freshMachineState("jobsiteTableSaw", gameState.progression);
    return [
      { machine, position: [cx - 0.5, cy - 0.5] as Vector },
      { machine, position: [cx - 0.28, cy - 0.68] as Vector },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scenery;
    // rebuilt only when the stack moves
  }, [decor]);
  return (
    <>
      {crates.map((crate, index) => (
        <MachineCrateSprite key={index} crate={crate} />
      ))}
    </>
  );
};

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
const MachineDisplay: React.FC<{ bay: ShelfBay }> = ({ bay }) => {
  const gameState = useGameState();
  const machine = useMemo(() => {
    if (bay.product.line.kind !== "machine") return null;
    const machineTypeId = bay.product.line.machineTypeId;
    // Facing 0 shops from the east, facing 2 from the west; the display
    // turns its working side toward its aisle.
    const rotation = bay.facing === 0 ? 1 : bay.facing === 2 ? 3 : 0;
    const [padX, padY] = rectCenter(bay.rect);
    const [fx, fy] = rotateOffset(
      footprintCenter(MACHINE_TYPES[machineTypeId].cellsOccupied),
      rotation,
    );
    return new Machine({
      ...freshMachineState(machineTypeId, gameState.progression),
      // Fractional position centers the art on the pad exactly; only
      // shop machines need to live on the grid.
      position: [padX - 0.5 - fx, padY - 0.5 - fy],
      rotation: rotation as 0 | 1 | 2 | 3,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuilt only
    // when the bay moves; progression only picks the idle operation
  }, [bay]);
  const drawBench = useCallback(
    (g: Graphics) => {
      g.clear();
      drawDisplayBench(g, bay);
    },
    [bay],
  );
  if (!machine) return null;
  const benchtop = Boolean(machine.type.benchtop);
  return (
    <>
      {benchtop && <pixiGraphics draw={drawBench} />}
      <MachineSprite machine={machine} />
    </>
  );
};

/** One bay's stock, drawn at world size — shared between the static
 * merchandise bake and the targeting highlight's live copy. */
const BayStock: React.FC<{ bay: ShelfBay }> = ({ bay }) => {
  const piles =
    bay.display === "lumberStack"
      ? lumberPiles(bay)
      : bay.display === "sheetStack"
        ? sheetPiles(bay)
        : bay.display === "racking"
          ? toolPiles(bay)
          : [];
  const iconPath =
    bay.display === "racking" && piles.length === 0
      ? supplyIconPath(bay.product.line)
      : null;
  if (bay.display === "machine") {
    return <MachineDisplay bay={bay} />;
  }
  return (
    <>
      {piles.map((p, index) => (
        <MaterialPileSprite key={`${bay.id}:${index}`} pile={p} />
      ))}
      {iconPath && <SupplyIconStock bay={bay} path={iconPath} />}
    </>
  );
};

/**
 * The whole floor's stock, baked once. The merchandise never moves, but
 * it's a lot of procedural geometry — hundreds of boards' worth of grain
 * and speckle. Rendered live it can dominate the frame (the E2E build's
 * software rasterizer measured whole seconds per frame), so the layer
 * rasterizes once and re-renders as a single texture until the planogram
 * changes. Memoized for the same reason: a cell crossing re-renders the
 * world, and re-reconciling a few hundred cached sprites every step is
 * measurable CPU for a picture that cannot have changed.
 */
export const StoreMerchandiseLayer = React.memo<{ layout: StoreLayout }>(
  function StoreMerchandiseLayer({ layout }) {
    const containerRef = useRef<Container>(null);
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;
      container.cacheAsTexture({ antialias: true });
      return () => {
        container.cacheAsTexture(false);
      };
    }, [layout]);

    return (
      <pixiContainer ref={containerRef}>
        {layout.fixtures.map((bay) => (
          <BayStock key={bay.id} bay={bay} />
        ))}
        {layout.decor.map((item, index) => (
          <CrateStack key={index} decor={item} />
        ))}
      </pixiContainer>
    );
  },
);

/**
 * The targeting treatment: the stock of the bay the shopper stands at,
 * drawn again over the baked floor wearing the same outline shader the
 * shop's stations use. A separate layer so pointing at a new bay never
 * touches the bake.
 */
export const StoreTargetHighlightLayer: React.FC<{
  layout: StoreLayout;
  targetId: string | null;
}> = ({ layout, targetId }) => {
  const bay = targetId
    ? (layout.fixtures.find((fixture) => fixture.id === targetId) ?? null)
    : null;
  if (!bay) return null;
  return (
    <pixiContainer filters={TARGET_HIGHLIGHT_FILTERS}>
      <BayStock bay={bay} />
    </pixiContainer>
  );
};
