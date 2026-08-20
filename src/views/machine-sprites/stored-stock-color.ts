import { colorBySheetGoodKind, colorBySpecies } from "../colorBySpecies";
import { MaterialInstance } from "../../game/Materials";
import { colorToNumber } from "../../utils/colorUtils";

/** What color a board of parked stock reads as from above. */
export function storedStockColor(material: MaterialInstance): number {
  if ("species" in material) {
    return colorToNumber(colorBySpecies[material.species].primary);
  }
  if (material.type === "plywood") {
    return colorToNumber(colorBySheetGoodKind[material.kind].primary);
  }
  return 0x9a8062;
}
