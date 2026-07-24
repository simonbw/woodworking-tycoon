import { Commission, ProgressionState } from "./GameState";
import { REAL_WOOD_SPECIES } from "./Materials";

/**
 * The authored, linear sequence of commissions. Each one introduces one new
 * element (tool, material, or technique), per GAMEPLAY_ROADMAP.md.
 *
 * Commissions must only require materials the player can actually produce at
 * that point in the sequence. Current production chain: dismantling a pallet
 * yields stringers (4x6x3 boards) and deck boards (3x4x1 boards), all rough;
 * the miter saw cuts length, the table saw rips width; sanding tools
 * (mounted at workstations) step surface rough → smooth → sanded; the planer
 * reduces thickness and leaves surfaces smooth; the workspace builds rustic
 * shelves from 2 stringers + 3 deck boards, glues five smooth 2x2x4 strips
 * into a (rough) panel, and finishes a sanded single-species hardwood panel
 * into a cutting board. Tools before machines: the sander era (commission 4)
 * comes well before the planer era (commission 7).
 *
 * From commission 10 on, skills enter the picture. Skills are bought with
 * points the player earns from XP levels (see Skill.ts), so these
 * commissions can't grant them — instead each description points at the
 * journal, and the ordering respects every prerequisite chain (boxJoinery
 * needs fineShelving, sunrise needs striped + freeform, end-grain needs
 * jigs). Commission XP alone (rewardMoney / 5, see store-actions) funds
 * roughly seven points by the finale; operations and jobs cover the rest.
 */
export const COMMISSION_SEQUENCE: ReadonlyArray<Commission> = [
  {
    id: "first-shelf",
    name: "Your First Shelf",
    description:
      "A neighbor wants a rustic shelf. Break down that pallet at the workspace and build one.",
    requiredMaterials: [
      { type: ["rusticShelf"], species: ["pallet"], quantity: 1 },
    ],
    rewardMoney: 200,
    rewardReputation: 2,
  },
  {
    id: "cut-to-order",
    name: "Cut to Order",
    description:
      "A picture framer needs short boards cut precisely to length. Sounds like a job for a miter saw.",
    requiredMaterials: [
      {
        type: ["board"],
        species: ["pallet"],
        length: [2],
        width: [4],
        thickness: [1],
        quantity: 4,
      },
    ],
    rewardMoney: 350,
    rewardReputation: 3,
  },
  {
    id: "ripped-slats",
    name: "Slat Set",
    description:
      "An order for narrow slats, ripped to a consistent width. Time for a table saw.",
    requiredMaterials: [
      {
        type: ["board"],
        species: ["pallet"],
        length: [3],
        width: [2],
        thickness: [1],
        quantity: 4,
      },
    ],
    rewardMoney: 500,
    rewardReputation: 3,
  },
  {
    id: "sanded-set",
    name: "Sanded Set",
    description:
      "An order for boards sanded baby-smooth. Grab something to sand with from the store's tool wall and mount it at a workstation.",
    requiredMaterials: [
      {
        type: ["board"],
        species: ["pallet"],
        length: [3],
        width: [4],
        thickness: [1],
        surface: ["sanded"],
        quantity: 4,
      },
    ],
    rewardMoney: 650,
    rewardReputation: 4,
  },
  {
    id: "double-shelf-order",
    name: "Double Shelf Order",
    description:
      "A cafe wants a matching pair of rustic shelves. Put the whole shop to work.",
    requiredMaterials: [
      { type: ["rusticShelf"], species: ["pallet"], quantity: 2 },
    ],
    rewardMoney: 800,
    rewardReputation: 5,
  },
  {
    id: "proper-cutting-board",
    name: "A Proper Cutting Board",
    description:
      'A chef wants real hardwood cutting boards. Buy lumber, rip it into 2" strips, glue up a panel, sand it silky, and finish it at the workspace.',
    requiredMaterials: [
      {
        type: ["simpleCuttingBoard"],
        species: REAL_WOOD_SPECIES,
        quantity: 2,
      },
    ],
    rewardMoney: 1000,
    rewardReputation: 6,
  },
  {
    id: "dimensioned-stock",
    name: "Dimensioned Stock",
    description:
      "A furniture maker needs thick stock milled down to exact thickness — that's planer work. Sanding won't take off a quarter inch.",
    requiredMaterials: [
      {
        type: ["board"],
        species: ["pallet"],
        length: [4],
        width: [6],
        thickness: [2],
        surface: ["smooth", "sanded"],
        quantity: 2,
      },
    ],
    rewardMoney: 1200,
    rewardReputation: 7,
  },
  {
    id: "balcony-garden",
    name: "Balcony Garden",
    description:
      "An apartment gardener wants planter boxes that survive the weather. Nails work loose in wet soil — you'll need a drill and a box of screws.",
    requiredMaterials: [
      { type: ["planterBox"], species: ["pallet"], quantity: 2 },
    ],
    rewardMoney: 1400,
    rewardReputation: 8,
  },
  {
    id: "oiled-and-ready",
    name: "Oiled & Ready",
    description:
      "A kitchen shop will stock your boards — if they arrive finished. Wipe on mineral oil at the workspace and let it soak in.",
    requiredMaterials: [
      {
        type: ["simpleCuttingBoard"],
        species: REAL_WOOD_SPECIES,
        finish: ["mineralOil"],
        quantity: 2,
      },
    ],
    rewardMoney: 1600,
    rewardReputation: 8,
  },
  {
    id: "gallery-wall",
    name: "Gallery Wall",
    description:
      "A photographer needs hardwood frames with corners that close tight. Study Mitered Frames in your journal, then swing the saw to its 45° stops.",
    requiredMaterials: [
      { type: ["pictureFrame"], species: REAL_WOOD_SPECIES, quantity: 2 },
    ],
    rewardMoney: 1900,
    rewardReputation: 9,
  },
  {
    id: "shelving-but-nice",
    name: "Shelving, But Nice",
    description:
      "The cafe is renovating — no more rustic. They want real hardwood shelves, sanded clean. The journal calls it Fine Shelving.",
    requiredMaterials: [
      { type: ["shelf"], species: REAL_WOOD_SPECIES, quantity: 2 },
    ],
    rewardMoney: 2200,
    rewardReputation: 10,
  },
  {
    id: "stripes",
    name: "Stripes",
    description:
      "A food blogger wants a striped board — walnut and maple in strict alternation. Work up through Two-Tone and Striped Boards in your journal.",
    requiredMaterials: [
      {
        type: ["stripedCuttingBoard"],
        species: ["walnut", "maple"],
        accentSpecies: ["walnut", "maple"],
        quantity: 1,
      },
    ],
    rewardMoney: 2500,
    rewardReputation: 10,
  },
  {
    id: "small-treasures",
    name: "Small Treasures",
    description:
      "A jeweler wants boxes worthy of what goes inside. Box Joinery takes thin stock — this is what you bought the planer for.",
    requiredMaterials: [
      { type: ["jewelryBox"], species: REAL_WOOD_SPECIES, quantity: 2 },
    ],
    rewardMoney: 2800,
    rewardReputation: 11,
  },
  {
    id: "the-sunrise-board",
    name: "The Sunrise Board",
    description:
      "A wedding gift: one wood fading into another, strip by strip. Freeform Lamination lets you glue any widths; Sunrise Boards makes them sing.",
    requiredMaterials: [
      {
        type: ["sunriseCuttingBoard"],
        species: REAL_WOOD_SPECIES,
        quantity: 1,
      },
    ],
    rewardMoney: 3200,
    rewardReputation: 12,
  },
  {
    id: "the-butchers-block",
    name: "The Butcher's Block",
    description:
      "The restaurant wants a true end-grain block, oiled and food-ready. Build a crosscut sled, slice a panel, stand the grain on end, and glue it all again. Everything you know, in one board.",
    requiredMaterials: [
      {
        type: ["endGrainCuttingBoard"],
        species: REAL_WOOD_SPECIES,
        finish: ["mineralOil"],
        quantity: 1,
      },
    ],
    rewardMoney: 4000,
    rewardReputation: 15,
  },
];

/** The commission the player is currently working on, or null if the authored sequence is finished. */
export function getActiveCommission(
  progression: ProgressionState,
): Commission | null {
  return COMMISSION_SEQUENCE[progression.commissionsCompleted] ?? null;
}

/** Whether the commission with the given id has been completed. */
export function hasCompletedCommission(
  progression: ProgressionState,
  commissionId: string,
): boolean {
  const index = COMMISSION_SEQUENCE.findIndex((c) => c.id === commissionId);
  return index !== -1 && progression.commissionsCompleted > index;
}
