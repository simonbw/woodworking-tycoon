import { DustSpecies } from "../../game/Materials";
import { SpeciesAmounts } from "../../game/Dust";
import { dustColorBySpecies } from "./colorBySpecies";

/**
 * The dominant species in one cell's amounts, or null for a clean
 * cell. DustMotionLayer colors its airborne flecks with this.
 */
export function dominantSpeciesColor(
  amounts: SpeciesAmounts | undefined,
): string | null {
  if (!amounts) return null;
  let best: DustSpecies | null = null;
  let bestAmount = 0;
  for (const [species, amount] of Object.entries(amounts)) {
    if ((amount ?? 0) > bestAmount) {
      best = species as DustSpecies;
      bestAmount = amount ?? 0;
    }
  }
  return best ? dustColorBySpecies[best].primary : null;
}
