import { Species } from "../../game/Materials";
import { colors } from "../../utils/colors";

export const colorBySpecies: Record<Species, string> = {
  pallet: colors.amber["400"],
  cherry: colors.brown["500"],
  mahogany: colors.brown["800"],
  maple: colors.yellow["300"],
  oak: colors.brown["300"],
  pine: colors.brown["300"],
  walnut: colors.brown["900"],
};
