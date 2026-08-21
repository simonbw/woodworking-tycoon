import { Graphics } from "pixi.js";
import {
  PALLET_HEIGHT_IN,
  PALLET_WIDTH_IN,
} from "../../game/bench-work/pallet-geometry";
import { productBlueprintFor } from "../../game/bench-work/blueprint";
import {
  Board,
  CUTTING_BOARD_FOOTPRINTS,
  MaterialInstance,
  Panel,
  panelWidth,
} from "../../game/Materials";
import { PIXELS_PER_INCH } from "../shop-scale";
import { drawContactShadow } from "./contactShadow";

/**
 * The one shadow a piece throws — every material's, in one place. A
 * piece casts exactly one shadow no matter how many boards it's built
 * from: a pallet or an assembled product shades its whole footprint
 * once, not a stack of per-part halos. `createMaterialSprite` draws it
 * on its own layer under the art, so the bench's hover rim can dress
 * the wood without tracing the shadow, and carrying a piece can spread
 * the shadow to say how far off the surface it rides.
 *
 * The spread comes from how far the piece stands off the surface (see
 * drawContactShadow): a lying board its thickness, a standing board its
 * width, a pallet its stringer-and-decks height.
 */

export interface ShadowLook {
  readonly widthPx: number;
  readonly heightPx: number;
  readonly standInches: number;
}

/** The shadow a material would throw as placed — for callers that
 * blend between two placements (the flip tumble) instead of drawing
 * one outright. */
export function materialShadowLook(
  material: MaterialInstance,
  placement: { onEdge?: boolean; onEnd?: boolean } = {},
): ShadowLook | null {
  return shadowLook(material, placement);
}

export function drawMaterialShadow(
  g: Graphics,
  material: MaterialInstance,
  placement: { onEdge?: boolean; onEnd?: boolean } = {},
  carry: {
    /** Inches the hand holds the piece off the surface. */
    liftInches?: number;
    /** The art's own carry growth, so the pool tracks the lifted
     * wood's footprint and the penumbra stays even around it. */
    footprintScale?: number;
  } = {},
): void {
  const look = shadowLook(material, placement);
  if (!look) return;
  const scale = carry.footprintScale ?? 1;
  const widthPx = look.widthPx * scale;
  const heightPx = look.heightPx * scale;
  drawContactShadow(
    g,
    -widthPx / 2,
    -heightPx / 2,
    widthPx,
    heightPx,
    look.standInches,
    { liftInches: carry.liftInches },
  );
}

function shadowLook(
  material: MaterialInstance,
  placement: { onEdge?: boolean; onEnd?: boolean },
): ShadowLook | null {
  switch (material.type) {
    case "board": {
      const b = material as Board;
      if (placement.onEnd) {
        // The tallest a board can stand — the shadow spreads to its cap
        return {
          widthPx: b.width * PIXELS_PER_INCH,
          heightPx: (b.thickness / 4) * PIXELS_PER_INCH,
          standInches: b.length,
        };
      }
      if (placement.onEdge) {
        // A standing board stands its whole width off the bench, and
        // the shadow says so — wider than the same board's lying rim
        return {
          widthPx: (b.thickness / 4) * PIXELS_PER_INCH,
          heightPx: b.length * PIXELS_PER_INCH,
          standInches: b.width,
        };
      }
      return {
        widthPx: b.width * PIXELS_PER_INCH,
        heightPx: b.length * PIXELS_PER_INCH,
        standInches: b.thickness / 4,
      };
    }

    case "plywood":
      return {
        widthPx: material.width * PIXELS_PER_INCH,
        heightPx: material.length * PIXELS_PER_INCH,
        standInches: material.thickness / 4,
      };

    case "panel":
      return {
        widthPx: panelWidth(material as Panel) * PIXELS_PER_INCH,
        heightPx: material.length * PIXELS_PER_INCH,
        standInches: material.thickness / 4,
      };

    case "endGrainSlice":
      // The slice as drawn: the strip run across, the 2" slice down
      // (drawEndGrainSlice)
      return {
        widthPx:
          material.strips.reduce((sum, strip) => sum + strip.width, 0) *
          PIXELS_PER_INCH,
        heightPx: 2 * PIXELS_PER_INCH,
        standInches: material.thickness / 4,
      };

    case "pallet":
      // Two decks over their stringers — the whole sandwich stands off
      // the surface
      return {
        widthPx: PALLET_WIDTH_IN * PIXELS_PER_INCH,
        heightPx: PALLET_HEIGHT_IN * PIXELS_PER_INCH,
        standInches: 4.5,
      };

    case "simpleCuttingBoard":
    case "stripedCuttingBoard":
    case "sunriseCuttingBoard":
    case "endGrainCuttingBoard":
    case "checkerboardCuttingBoard": {
      // An inch of cutting board off the bench — the penumbra rounds
      // the corners on its own
      const footprint = CUTTING_BOARD_FOOTPRINTS[material.type];
      return {
        widthPx: footprint.widthIn * PIXELS_PER_INCH,
        heightPx: footprint.heightIn * PIXELS_PER_INCH,
        standInches: 1,
      };
    }

    case "tool":
      return null;

    default: {
      // A blueprint-assembled product shades its blueprint's box — the
      // very frame assembledProduct.ts draws in
      const blueprint = productBlueprintFor(material.type);
      if (!blueprint) return null;
      return {
        widthPx: blueprint.widthIn * PIXELS_PER_INCH,
        heightPx: blueprint.heightIn * PIXELS_PER_INCH,
        standInches: 2,
      };
    }
  }
}
