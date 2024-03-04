import { SheetGoodKind, Species } from "../../game/Materials";
import { colors } from "../../utils/colors";

export const colorBySpecies: Record<
  Species,
  { primary: string; secondary: string }
> = {
  pallet: { primary: "#D9CF74", secondary: "#BFB561" },
  cherry: { primary: "#B1754A", secondary: "#874C21" },
  mahogany: { primary: "#774D2E", secondary: "#57351B" },
  maple: { primary: "#F1D5A2", secondary: "#EABA68" },
  oak: { primary: "#B19F7A", secondary: "#8D7C59" },
  pine: { primary: "#DAC3B2", secondary: "#C7A88F" },
  walnut: { primary: "#5F4530", secondary: "#483622" },
  purpleHeart: { primary: "#885368", secondary: "#6D4354" },
};

export const colorBySheetGoodKind: Record<SheetGoodKind, { primary: string }> =
  {
    mdf: { primary: "#846046" },
    osb: { primary: "#BA9D59" },
    particleBoard: { primary: "#D0D0D0" },
    plywoodA: { primary: "#B19F7A" },
    plywoodB: { primary: "#F1D5A2" },
    plywoodC: { primary: "#DAC3B2" },
  };
