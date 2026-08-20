import { Graphics } from "pixi.js";
import { colorBySheetGoodKind, colorBySpecies } from "./colorBySpecies";
import { PIXELS_PER_INCH } from "./shop-scale";
import { MaterialInstance, panelWidth } from "../game/Materials";
import { colorToNumber, mixColors } from "../utils/colorUtils";

/**
 * A stand-in drawing for a material lying somewhere a view has to show
 * it (the truck's bed, the stand's tabletop): the piece's real footprint
 * in its species' color, centered on the origin, long axis down +y —
 * the same frame the old MaterialSprite drew in.
 *
 * Interim on purpose: the material-sprite fan-out ports the full
 * per-type renderers (grain, milled state, assembled products) as
 * view-side drawing; when that lands, callers swap this for it and this
 * module goes away.
 */

/** The gray of weathered, unmilled lumber (BoardSprite's constant). */
const WEATHERED_GRAY = 0x9a9186;

/** Generic block for products/tools with no footprint of their own. */
const GENERIC_INCHES = 14;

export function drawMaterialGlyph(g: Graphics, material: MaterialInstance) {
  switch (material.type) {
    case "board": {
      const w = material.width * PIXELS_PER_INCH;
      const h = material.length * PIXELS_PER_INCH;
      const { primary, secondary } = colorBySpecies[material.species];
      const revealed =
        material.jointedFaces > 0 || material.surface !== "rough";
      const face = revealed
        ? colorToNumber(primary)
        : mixColors(primary, WEATHERED_GRAY, 0.62);
      g.rect(-w / 2, -h / 2, w, h);
      g.fill(face);
      g.rect(-w / 2, -h / 2, w, h);
      g.stroke({ width: 1, color: colorToNumber(secondary) });
      break;
    }
    case "plywood": {
      const w = material.width * PIXELS_PER_INCH;
      const h = material.length * PIXELS_PER_INCH;
      const { primary, secondary } = colorBySheetGoodKind[material.kind];
      g.rect(-w / 2, -h / 2, w, h);
      g.fill(colorToNumber(primary));
      g.rect(-w / 2, -h / 2, w, h);
      g.stroke({ width: 1, color: colorToNumber(secondary) });
      break;
    }
    case "panel": {
      const h = material.length * PIXELS_PER_INCH;
      const w = panelWidth(material) * PIXELS_PER_INCH;
      let x = -w / 2;
      for (const strip of material.strips) {
        const sw = strip.width * PIXELS_PER_INCH;
        g.rect(x, -h / 2, sw, h);
        g.fill(colorToNumber(colorBySpecies[strip.species].primary));
        x += sw;
      }
      g.rect(-w / 2, -h / 2, w, h);
      g.stroke({ width: 1, color: 0x00000033 });
      break;
    }
    case "pallet": {
      // A standard pallet's footprint, slats across it
      const w = 40 * PIXELS_PER_INCH;
      const h = 48 * PIXELS_PER_INCH;
      const { primary, secondary } = colorBySpecies.pallet;
      g.rect(-w / 2, -h / 2, w, h);
      g.fill(mixColors(primary, WEATHERED_GRAY, 0.5));
      for (let i = 1; i < 7; i++) {
        g.rect(-w / 2, -h / 2 + (h / 7) * i, w, 2);
      }
      g.fill(mixColors(secondary, WEATHERED_GRAY, 0.5));
      break;
    }
    default: {
      // Finished products, tools, slices: a squarish piece in the wood's
      // tone, so what's set out at least reads as merchandise.
      const species = "species" in material ? material.species : "pine";
      const size = GENERIC_INCHES * PIXELS_PER_INCH;
      const { primary, secondary } = colorBySpecies[species];
      g.roundRect(-size / 2, -size / 2, size, size, 4);
      g.fill(colorToNumber(primary));
      g.roundRect(-size / 2, -size / 2, size, size, 4);
      g.stroke({ width: 2, color: colorToNumber(secondary) });
      break;
    }
  }
}
