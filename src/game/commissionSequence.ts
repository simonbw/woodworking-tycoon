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
