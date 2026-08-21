import { Container, Graphics } from "pixi.js";
import {
  CuttingBoardType,
  FinishedProduct,
  MaterialInstance,
} from "../../game/Materials";
import { createAssembledProductSprite } from "./assembledProduct";
import { createBoardSprite, drawBoardOnEdge, drawBoardOnEnd } from "./board";
import { drawCuttingBoard } from "./cuttingBoard";
import { drawMaterialShadow } from "./materialShadow";
import { createPalletSprite } from "./pallet";
import { drawEndGrainSlice, drawPanel } from "./panel";
import { drawSheetGood } from "./sheetGood";
import { createToolItemSprite, drawDefaultPile } from "./toolItem";

/**
 * The shared material drawing — the old `material-sprites/` React family
 * as one imperative builder. Everything that shows a material goes
 * through here: the pile view, the player's arms, and (later) the
 * machine bays and the bench view.
 *
 * `createMaterialSprite` returns a fresh display object centered on the
 * material's own center; the caller positions, rotates, parents, and
 * eventually destroys it. Materials are immutable data, so there is no
 * update path — when the material changes (a different instance), build
 * a new sprite; `sameMaterialList` is the cheap key compare for
 * inventories that want to know whether a rebuild is due.
 */
export interface MaterialSpriteOptions {
  alpha?: number;
  tint?: number;
  /** The piece's bench placement has it standing on its long edge —
   * boards draw edge-up (drawBoardOnEdge); other types ignore it. */
  onEdge?: boolean;
  /** …or standing on its end: boards draw as bare end grain. */
  onEnd?: boolean;
  /** The piece lies face-down. The caller applies the actual mirror (a
   * negative x scale); pallets additionally reorder their layers and
   * swap which nail heads show (createPalletSprite). */
  flipped?: boolean;
  /** Skip the contact shadow — for a sprite stacked over another copy
   * of the same piece (the stroke reveal's finished state), which would
   * otherwise darken the one shadow already under it. */
  shadow?: boolean;
}

/**
 * The sprite's two layers, split so effects can address them apart: the
 * hover rim dresses the art without tracing the shadow, and carrying a
 * piece spreads the shadow without touching the wood.
 */
export const MATERIAL_SHADOW_LABEL = "shadow";
export const MATERIAL_ART_LABEL = "art";

/** The sprite's shadow layer, for effects that spread or hide it. */
export function materialSpriteShadow(sprite: Container): Container | null {
  return (
    sprite.children.find((child) => child.label === MATERIAL_SHADOW_LABEL) ??
    null
  );
}

/** The sprite's art layer — the wood itself, for rims and tints. */
export function materialSpriteArt(sprite: Container): Container | null {
  return (
    sprite.children.find((child) => child.label === MATERIAL_ART_LABEL) ?? null
  );
}

export function createMaterialSprite(
  material: MaterialInstance,
  options: MaterialSpriteOptions = {},
): Container {
  const { alpha, shadow = true, onEdge, onEnd } = options;
  const root = new Container();
  if (shadow) {
    const shadowG = new Graphics();
    shadowG.label = MATERIAL_SHADOW_LABEL;
    drawMaterialShadow(shadowG, material, { onEdge, onEnd });
    if (alpha !== undefined) shadowG.alpha = alpha;
    root.addChild(shadowG);
  }
  const art = createMaterialArt(material, options);
  art.label = MATERIAL_ART_LABEL;
  root.addChild(art);
  return root;
}

/** The wood itself, shadowless — one drawing per material type. */
function createMaterialArt(
  material: MaterialInstance,
  options: MaterialSpriteOptions,
): Container {
  const { alpha, tint, onEdge, onEnd, flipped } = options;

  /** One Graphics with the shared alpha/tint applied — the common case. */
  const graphics = (draw: (g: Graphics) => void): Graphics => {
    const g = new Graphics();
    draw(g);
    if (alpha !== undefined) g.alpha = alpha;
    if (tint !== undefined) g.tint = tint;
    return g;
  };

  switch (material.type) {
    case "board":
      return onEnd
        ? graphics((g) => drawBoardOnEnd(g, material, material.id))
        : onEdge
          ? graphics((g) => drawBoardOnEdge(g, material, material.id))
          : createBoardSprite(material, material.id, { alpha, tint });

    case "pallet":
      return createPalletSprite(material, { alpha, tint, flipped });

    case "plywood":
      return graphics((g) => drawSheetGood(g, material, material.id));

    case "panel":
      return graphics((g) => drawPanel(g, material, material.id));

    // Blueprint-assembled products draw from their bill of materials —
    // the same slots the bench view assembled them on
    case "rusticShelf":
    case "crate":
    case "planterBox":
    case "stepStool":
    case "bookshelf":
    case "birdhouse":
    case "rusticFrame":
    case "pictureFrame":
    case "hexFrame":
    case "jewelryBox":
    case "shelf":
    case "servingTray":
    case "sideTable":
      return createAssembledProductSprite(material as FinishedProduct, {
        alpha,
        tint,
      });

    case "endGrainSlice":
      return graphics((g) => drawEndGrainSlice(g, material, material.id));

    case "tool":
      return createToolItemSprite(material, { alpha, tint });

    case "simpleCuttingBoard":
    case "stripedCuttingBoard":
    case "sunriseCuttingBoard":
    case "endGrainCuttingBoard":
    case "checkerboardCuttingBoard": {
      // The switch guarantees the narrowing TS won't carry into the object
      const cuttingBoard = material as FinishedProduct & {
        type: CuttingBoardType;
      };
      return graphics((g) => drawCuttingBoard(g, cuttingBoard, material.id));
    }

    default:
      return graphics(drawDefaultPile);
  }
}

/**
 * Whether two material lists hold the very same instances in the same
 * order — the rebuild key for views that draw a list (the player's
 * arms). Reference compare on purpose: materials are immutable data, so
 * a changed hand always means a changed instance.
 */
export function sameMaterialList(
  a: ReadonlyArray<MaterialInstance>,
  b: ReadonlyArray<MaterialInstance>,
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
