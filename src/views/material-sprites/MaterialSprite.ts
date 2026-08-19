import { Container, Graphics } from "pixi.js";
import { FinishedProduct, MaterialInstance } from "../../game/Materials";
import { createAssembledProductSprite } from "./assembledProduct";
import { createBoardSprite, drawBoardOnEdge, drawBoardOnEnd } from "./board";
import { drawCuttingBoard } from "./cuttingBoard";
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
}

export function createMaterialSprite(
  material: MaterialInstance,
  options: MaterialSpriteOptions = {},
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
      return graphics((g) => drawPanel(g, material));

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
      return graphics((g) => drawEndGrainSlice(g, material));

    case "tool":
      return createToolItemSprite(material, { alpha, tint });

    case "simpleCuttingBoard":
    case "stripedCuttingBoard":
    case "sunriseCuttingBoard":
    case "endGrainCuttingBoard":
    case "checkerboardCuttingBoard":
      return graphics((g) => drawCuttingBoard(g, material));

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
