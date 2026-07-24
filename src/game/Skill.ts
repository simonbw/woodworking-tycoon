/**
 * The skill tree (see docs/skills-and-recipes.md). Every recipe in the game
 * belongs to a skill; skills the player can use from the start are
 * `startsUnlocked` — shown in the journal as already-earned
 * certificates so the system explains itself.
 */
export const SKILL_IDS = [
  "basicMilling",
  "quickDryGlue",
  "rusticCarpentry",
  "panelWork",
  "fineShelving",
  "boxJoinery",
  "miteredFrames",
  "surfacePrep",
  "efficientSanding",
  "twoToneBoards",
  "stripedBoards",
  "freeformLamination",
  "sunriseBoards",
  "jigsAndFixtures",
  "endGrainBoards",
  "polygonJoinery",
  "trayWork",
  "furnitureBasics",
  "checkerboards",
] as const;
export type SkillId = (typeof SKILL_IDS)[number];

export interface SkillType {
  readonly id: SkillId;
  readonly name: string;
  readonly description: string;
  readonly branch: SkillBranch;
  /** Skills that must be unlocked before this one can be bought. */
  readonly requires: ReadonlyArray<SkillId>;
  readonly startsUnlocked?: boolean;
}

export const SKILL_BRANCHES = ["milling", "joinery", "finishing"] as const;
export type SkillBranch = (typeof SKILL_BRANCHES)[number];

export const SKILL_TYPES: Record<SkillId, SkillType> = {
  basicMilling: {
    id: "basicMilling",
    name: "Basic Milling",
    description:
      "Breaking down pallets, crosscutting, ripping, and planing stock.",
    branch: "milling",
    requires: [],
    startsUnlocked: true,
  },
  quickDryGlue: {
    id: "quickDryGlue",
    name: "Quick-Dry Glue",
    description: "Better glue, better clamping. Glue-ups dry 40% faster.",
    branch: "milling",
    requires: ["basicMilling"],
  },
  rusticCarpentry: {
    id: "rusticCarpentry",
    name: "Rustic Carpentry",
    description: "Honest work with reclaimed wood: the rustic pallet shelf.",
    branch: "joinery",
    requires: [],
    startsUnlocked: true,
  },
  panelWork: {
    id: "panelWork",
    name: "Panel Work",
    description:
      "Gluing strips into panels and finishing them into cutting boards.",
    branch: "joinery",
    requires: [],
    startsUnlocked: true,
  },
  fineShelving: {
    id: "fineShelving",
    name: "Fine Shelving",
    description:
      "A proper hardwood shelf: sanded stock, clean lines, real money.",
    branch: "joinery",
    requires: ["rusticCarpentry"],
  },
  boxJoinery: {
    id: "boxJoinery",
    name: "Box Joinery",
    description:
      "Jewelry boxes from thin sanded stock. You'll want a planer for this.",
    branch: "joinery",
    requires: ["fineShelving"],
  },
  miteredFrames: {
    id: "miteredFrames",
    name: "Mitered Frames",
    description:
      "Eight 45° cuts that all have to agree. Picture frames from mitered stock.",
    branch: "joinery",
    requires: ["rusticCarpentry"],
  },
  surfacePrep: {
    id: "surfacePrep",
    name: "Surface Prep",
    description: "Sanding: rough to smooth to silky.",
    branch: "finishing",
    requires: [],
    startsUnlocked: true,
  },
  efficientSanding: {
    id: "efficientSanding",
    name: "Efficient Sanding",
    description: "Technique beats effort. Sanding goes 40% faster.",
    branch: "finishing",
    requires: ["surfacePrep"],
  },
  twoToneBoards: {
    id: "twoToneBoards",
    name: "Two-Tone Boards",
    description:
      "Cutting boards striped from two species. Customers pay extra for pretty.",
    branch: "finishing",
    requires: ["surfacePrep"],
  },
  stripedBoards: {
    id: "stripedBoards",
    name: "Striped Boards",
    description:
      "Two woods in strict alternation. Discipline at the glue-up, drama on the shelf.",
    branch: "finishing",
    requires: ["twoToneBoards"],
  },
  freeformLamination: {
    id: "freeformLamination",
    name: "Freeform Lamination",
    description:
      "Glue up any two strips, then keep adding more — panels of any width and pattern.",
    branch: "joinery",
    requires: ["panelWork"],
  },
  sunriseBoards: {
    id: "sunriseBoards",
    name: "Sunrise Boards",
    description:
      "One wood fades out as the other fades in. The showpiece of the strip board.",
    branch: "finishing",
    requires: ["stripedBoards", "freeformLamination"],
  },
  jigsAndFixtures: {
    id: "jigsAndFixtures",
    name: "Jigs & Fixtures",
    description:
      "Shop-made tooling. Build a crosscut sled and your saw can do things no store-bought rig can.",
    branch: "milling",
    requires: ["basicMilling"],
  },
  endGrainBoards: {
    id: "endGrainBoards",
    name: "End-Grain Boards",
    description:
      "Slice a panel, stand the grain on end, glue it again. Butcher-block money.",
    branch: "finishing",
    requires: ["surfacePrep", "jigsAndFixtures"],
  },
  polygonJoinery: {
    id: "polygonJoinery",
    name: "Polygon Joinery",
    description:
      "Six corners at 30°, eight at 22.5°. The saw's other angle stops finally earn their keep.",
    branch: "joinery",
    requires: ["miteredFrames"],
  },
  trayWork: {
    id: "trayWork",
    name: "Tray Work",
    description:
      "A sanded panel wrapped in mitered rails: the serving tray. Panels meet miters.",
    branch: "joinery",
    requires: ["miteredFrames", "panelWork"],
  },
  furnitureBasics: {
    id: "furnitureBasics",
    name: "Furniture Basics",
    description:
      "A wide glued top on four square legs. The side table is the first piece that furnishes a room.",
    branch: "joinery",
    requires: ["fineShelving", "freeformLamination"],
  },
  checkerboards: {
    id: "checkerboards",
    name: "Checkerboards",
    description:
      "Two-tone end-grain slices, every other one flipped. The pattern hiding inside the block.",
    branch: "finishing",
    requires: ["endGrainBoards"],
  },
};

export const STARTER_SKILLS: ReadonlyArray<SkillId> = SKILL_IDS.filter(
  (id) => SKILL_TYPES[id].startsUnlocked,
);
