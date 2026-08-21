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

interface ShadowLook {
  readonly widthPx: number;
  readonly heightPx: number;
  /** Extra spread past the right edge — the standing board's face
   * sliver leans that way (drawBoardOnEdge). */
  readonly widenPx?: number;
  readonly standInches: number;
  readonly alpha?: number;
  readonly radius?: number;
}

export function drawMaterialShadow(
  g: Graphics,
  material: MaterialInstance,
  placement: { onEdge?: boolean; onEnd?: boolean } = {},
): void {
  const look = shadowLook(material, placement);
  if (!look) return;
  drawContactShadow(
    g,
    -look.widthPx / 2,
    -look.heightPx / 2,
    look.widthPx + (look.widenPx ?? 0),
    look.heightPx,
    look.standInches,
    { alpha: look.alpha, radius: look.radius },
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
          alpha: 0.18,
        };
      }
      if (placement.onEdge) {
        // A standing board stands its whole width off the bench, and
        // the shadow says so — far wider than any lying board's
        const edgePx = (b.thickness / 4) * PIXELS_PER_INCH;
        return {
          widthPx: edgePx,
          heightPx: b.length * PIXELS_PER_INCH,
          widenPx: Math.min(edgePx * 0.8, 3),
          standInches: b.width,
          alpha: 0.18,
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
      // An inch of cutting board off the bench, rounded like its corners
      const footprint = CUTTING_BOARD_FOOTPRINTS[material.type];
      return {
        widthPx: footprint.widthIn * PIXELS_PER_INCH,
        heightPx: footprint.heightIn * PIXELS_PER_INCH,
        standInches: 1,
        radius: 2 * PIXELS_PER_INCH,
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
