import { Species } from "../../game/Materials";
import { colorBySpecies } from "./colorBySpecies";

/**
 * The dominant species in one cell's amounts, or null for a clean
 * cell. DustMotionLayer colors its airborne flecks with this.
 */
export function dominantSpeciesColor(
  amounts: Readonly<Partial<Record<Species, number>>> | undefined,
): string | null {
  if (!amounts) return null;
  let best: Species | null = null;
  let bestAmount = 0;
  for (const [species, amount] of Object.entries(amounts)) {
    if ((amount ?? 0) > bestAmount) {
      best = species as Species;
      bestAmount = amount ?? 0;
    }
  }
  return best ? colorBySpecies[best].primary : null;
}
