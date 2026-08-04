import { Commission, ProgressionState } from "./GameState";
import { REAL_WOOD_SPECIES } from "./Materials";

/**
 * The authored, linear sequence of commissions. Commissions are rare,
 * milestone events: each one demands a cluster of capabilities the player
 * doesn't have yet (machines, tools, skills), and the next client doesn't
 * call until the shop's reputation reaches the commission's
 * `minReputation`. Between commissions the player lives on the job board
 * and listings — that's where reputation, money, and XP come from.
 *
 * A commission "arrives" over the phone: when reputation crosses the
 * threshold, `checkProgressionMilestonesAction` bumps
 * `progression.commissionsOffered` and the call plays out in the UI (see
 * CommissionCallLayer). The active commission is derived from the
 * offered/completed pair, never stored.
 *
 * Commissions must only require materials the player can actually produce
 * once they've bought the gear the commission is pushing them toward.
 * Current production chain: dismantling a pallet yields stringers
 * (4x6x3 boards) and deck boards (3x4x1 boards), all rough; the miter saw
 * cuts length, the table saw rips width; sanding tools (mounted at
 * workstations) step surface rough → smooth → sanded; the planer reduces
 * thickness and leaves surfaces smooth; the workspace builds rustic
 * shelves from 2 stringers + 3 deck boards, glues five smooth 2x2x4
 * strips into a (rough) panel, and finishes a sanded single-species
 * hardwood panel into a cutting board.
 *
 * Skills are bought with points the player earns from XP levels (see
 * Skill.ts), so commissions can't grant them — instead each description
 * points at the journal, and the ordering respects every prerequisite
 * chain (boxJoinery needs fineShelving, end-grain needs jigs). Job and
 * operation XP between commissions funds the points each cluster asks for.
 */
export const COMMISSION_SEQUENCE: ReadonlyArray<Commission> = [
  {
    id: "first-shelf",
    name: "Your First Shelf",
    description:
      "A neighbor wants a rustic shelf. Take the truck out to scavenge a pallet, break it down at the workspace, and build one.",
    requiredMaterials: [
      { type: ["rusticShelf"], species: ["pallet"], quantity: 1 },
    ],
    rewardMoney: 20,
    rewardReputation: 2,
    minReputation: 0,
    call: [
      "Hi! It's Marguerite, two doors down. I hear you've been setting up a workshop in there.",
      "Could you build me a shelf? Nothing fancy — rustic is fine. Sturdy is the thing.",
    ],
    client: "Marguerite, two doors down",
    thanks:
      "Oh, that's solid. I was expecting something I'd have to re-hang by Tuesday. Do you take other work?",
  },
  {
    id: "frame-shop-order",
    name: "The Frame Shop Order",
    description:
      "A picture framer needs short boards cut precisely to length, ripped to a consistent width, and sanded baby-smooth. That's a miter saw, a table saw, and something to sand with — the whole starter shop.",
    requiredMaterials: [
      {
        type: ["board"],
        species: ["pallet"],
        length: [24],
        width: [2],
        thickness: [2],
        surface: ["sanded"],
        quantity: 4,
      },
    ],
    rewardMoney: 30,
    rewardReputation: 2,
    minReputation: 6,
    call: [
      "Hello — Ellis, of Ellis Frame & Glass. Marguerite showed me your shelf.",
      "I need frame stock: four short boards, two foot even, two inches wide, sanded smooth enough to swear by.",
      "Every supplier I've tried cuts crooked. Prove me wrong?",
    ],
    client: "Ellis, of Ellis Frame & Glass",
    thanks:
      "Every one the same length, the same width, and no snags anywhere. You would not believe how rarely that happens. I'll send people your way.",
  },
  {
    id: "proper-cutting-board",
    name: "A Proper Cutting Board",
    description:
      'A chef wants real hardwood cutting boards, oiled and food-ready. Buy lumber, rip it into 2" strips, glue up a panel, sand it silky, finish it at the workspace, and wipe on mineral oil.',
    requiredMaterials: [
      {
        type: ["simpleCuttingBoard"],
        species: REAL_WOOD_SPECIES,
        finish: ["mineralOil"],
        quantity: 2,
      },
    ],
    rewardMoney: 95,
    rewardReputation: 3,
    minReputation: 30,
    call: [
      "This is Anton Reyes — chef. Ellis showed me the boards you cut for him.",
      "I want two real hardwood cutting boards for my line. Glued up proper, sanded silky, oiled and food-ready.",
      "Not the bamboo junk they sell restaurants. Real wood. Can you do it?",
    ],
    client: "Chef Anton Reyes",
    thanks:
      "Flat, I can't find the glue lines, and there's no work left on my end. I've thrown out boards that cost more than these.",
  },
  {
    id: "cafe-fitout",
    name: "The Cafe Fit-Out",
    description:
      "The cafe is renovating, and they want the whole works: real hardwood shelves, sanded clean — the journal calls it Fine Shelving — planter boxes for the patio, screwed together so the weather can't work them loose, and a striped walnut-and-maple board for the counter. Work up through Two-Tone and Striped Boards for that one.",
    requiredMaterials: [
      { type: ["shelf"], species: REAL_WOOD_SPECIES, quantity: 2 },
      { type: ["planterBox"], species: ["pallet"], quantity: 2 },
      {
        type: ["stripedCuttingBoard"],
        species: ["walnut", "maple"],
        accentSpecies: ["walnut", "maple"],
        quantity: 1,
      },
    ],
    rewardMoney: 240,
    rewardReputation: 4,
    minReputation: 40,
    call: [
      "Priya, from The Second Cup! We're renovating, and I want the whole works from your shop.",
      "Two real hardwood shelves for behind the machine. Two planter boxes for the patio — screwed together, they live outside.",
      "And a striped walnut-and-maple board for the counter, where everybody sees it. Say yes — I've already painted.",
    ],
    client: "Priya, of The Second Cup",
    thanks:
      "The shelves go up behind the espresso machine, the planters flank the door, and the striped board sits by the register where everybody sees it. This place finally looks like somewhere.",
  },
  {
    id: "small-treasures",
    name: "Small Treasures",
    description:
      "A jeweler is refitting the shop: boxes worthy of what goes inside, and frames with corners that close tight for the wall behind the counter. Box Joinery takes thin stock — this is what you buy a planer for — and Mitered Frames takes the saw's 45° stops.",
    requiredMaterials: [
      { type: ["jewelryBox"], species: REAL_WOOD_SPECIES, quantity: 2 },
      { type: ["pictureFrame"], species: REAL_WOOD_SPECIES, quantity: 2 },
    ],
    rewardMoney: 290,
    rewardReputation: 4,
    minReputation: 52,
    call: [
      "My name is Idris Farouk; I keep a jewelry shop on Fifth.",
      "I would like two boxes worthy of what goes inside them, and two frames for the wall behind the counter.",
      "Thin stock, corners that interlock, miters that disappear. I'm told you're the one to ask.",
    ],
    client: "Idris Farouk",
    thanks:
      "The corners interlock and the miters disappear. People are going to open these boxes before they look at what's inside them.",
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
    rewardMoney: 340,
    rewardReputation: 5,
    minReputation: 66,
    call: [
      "Anton again. The restaurant's growing, and my line needs a real block.",
      "True end grain. Oiled, heavy, flat as glass. The kind of board that outlives the restaurant.",
      "Everything you know, in one board. Name your day.",
    ],
    client: "Chef Anton Reyes",
    thanks:
      "End grain, oiled, flat as glass. That first board you sold me is still on my line, you know. This one outlives the restaurant.",
  },
];

/**
 * The commission the player is currently working on: offered over the
 * phone but not yet delivered. Null between commissions (waiting for
 * reputation to bring the next call) and after the sequence is finished.
 */
export function getActiveCommission(
  progression: ProgressionState,
): Commission | null {
  if (progression.commissionsOffered <= progression.commissionsCompleted) {
    return null;
  }
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

/**
 * Whether the commission with the given id has been offered (the client
 * has called — it may or may not be delivered yet). Used for unlocks that
 * should appear the moment a commission starts asking for them.
 */
export function hasBeenOfferedCommission(
  progression: ProgressionState,
  commissionId: string,
): boolean {
  const index = COMMISSION_SEQUENCE.findIndex((c) => c.id === commissionId);
  return index !== -1 && progression.commissionsOffered > index;
}
