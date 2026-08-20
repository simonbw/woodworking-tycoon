import { DustSpecies, SheetGoodKind, Species } from "../game/Materials";
import { colors } from "../utils/colors";

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
  poplar: { primary: "#E5DFAE", secondary: "#C3BD85" },
  walnut: { primary: "#5F4530", secondary: "#483622" },
  purpleHeart: { primary: "#885368", secondary: "#6D4354" },
};

/**
 * Dust colors, species and sheet pseudo-species alike (see
 * docs/dust-and-cleaning.md). The sheet entries are deliberately nastier
 * than the sheets themselves: plywood sheds a gray-tan gluey chip, MDF a
 * dull beige powder that gets everywhere, the chip boards a dirty
 * resinous grit.
 */
export const dustColorBySpecies: Record<
  DustSpecies,
  { primary: string; secondary: string }
> = {
  ...colorBySpecies,
  plywood: { primary: "#C3B69A", secondary: "#9C8F74" },
  mdf: { primary: "#C6B49B", secondary: "#9B8A72" },
  osb: { primary: "#B79C6C", secondary: "#8C7449" },
  particleBoard: { primary: "#BFB4A6", secondary: "#958B7E" },
};

export const colorBySheetGoodKind: Record<
  SheetGoodKind,
  { primary: string; secondary: string }
> = {
  mdf: { primary: "#846046", secondary: "#6E4F39" },
  osb: { primary: "#BA9D59", secondary: "#8F7440" },
  particleBoard: { primary: "#D0D0D0", secondary: "#A8A198" },
  plywoodA: { primary: "#B19F7A", secondary: "#8D7C59" },
  plywoodB: { primary: "#F1D5A2", secondary: "#EABA68" },
  plywoodC: { primary: "#DAC3B2", secondary: "#C7A88F" },
};

/** The strand palette OSB chips draw from — varied tans over the base. */
export const osbFlakeColors: ReadonlyArray<string> = [
  "#C9AC66",
  "#A98B4B",
  "#93773E",
  "#D2B87A",
];
