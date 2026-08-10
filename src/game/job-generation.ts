import { hasCompletedCommission } from "./commissionSequence";
import { GameState, JobOffer } from "./GameState";
import { InputMaterialWithQuantity } from "./Machine";
import { createMockMaterial } from "./material-helpers";
import { getSellValue } from "./material-values";
import { roundToCents } from "./marketplace";
import { ownsMachine, ownsTool } from "./progression-helpers";
import { hasSkill } from "./skill-helpers";
import { unlockedLumberChannels } from "./lumberStock";
import { REAL_WOOD_SPECIES, Species } from "./Materials";
import { humanizeString } from "../utils/humanizeString";
import { idMaker } from "../utils/idMaker";

const makeJobId = idMaker();

/**
 * Job generation (the board half of the marketplace — see the header of
 * marketplace.ts for the three-track economy). Offers come from the
 * player's capability envelope — what they can actually build right now —
 * so the board never asks for the impossible, and it skews toward the most
 * advanced capability so new equipment immediately brings matching work.
 *
 * **Every template asks for something the shop built.** Wood has no sale
 * price (see material-values.ts), so a job for loose boards would be a job
 * for nothing — a client who wants lumber goes to a lumberyard. New
 * equipment still brings its own work, but as the *product* it makes: the
 * table saw and the miter saw earn their keep through rustic frames, not
 * through crosscutting errands.
 *
 * Requirements here must stay DECLARATIVE (no `matches` predicates):
 * offers live in GameState and round-trip through JSON save/load, which
 * would silently drop a function. `minPanelWidth` exists for exactly this
 * reason (see Machine.ts).
 */

/** The board holds this many open offers after a refresh. */
export const JOB_BOARD_MIN_OFFERS = 3;
export const JOB_BOARD_MAX_OFFERS = 5;

/** Jobs pay a guaranteed multiple of the deliverables' fair value. */
const JOB_PAY_MULTIPLIER_MIN = 1.5;
const JOB_PAY_MULTIPLIER_MAX = 2.0;

/**
 * How often a hardwood product ask names one specific species ("in walnut,
 * to match the counters"). Specific asks pay their species' full value —
 * that flows through fair-value pricing on its own — and tip extra
 * reputation for hitting the constraint.
 */
const SPECIES_REQUEST_CHANCE = 0.4;

interface JobTemplate {
  /**
   * Stable identity for capability tracking: ids the player has never had
   * available before get a burst of guaranteed offers on the next refresh
   * (see generateJobBoard), so new equipment and skills bring work the
   * moment word gets around.
   */
  readonly id: string;
  /**
   * Higher tiers need more advanced equipment. Generation is weighted
   * toward the highest available tier — the board fills with work for
   * whatever the player most recently became able to do.
   */
  readonly tier: number;
  /**
   * Zero-material-cost work (pallet wood, fulfillable from scavenging).
   * At least one such job is always on the board — the income floor.
   */
  readonly zeroMaterialCost: boolean;
  readonly available: (gameState: GameState) => boolean;
  readonly generate: (rng: () => number, gameState: GameState) => GeneratedJob;
}

interface GeneratedJob {
  /**
   * The listing body as the poster typed it into SawdustList — always in
   * the client's first-person voice, never a third-person summary.
   */
  readonly description: string;
  readonly requiredMaterials: ReadonlyArray<InputMaterialWithQuantity>;
  readonly baseReputation: number;
}

function pick<T>(rng: () => number, items: ReadonlyArray<T>): T {
  return items[Math.floor(rng() * items.length)];
}

function intBetween(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Generated client flavor: who's asking. */
const CLIENT_NAMES = [
  "Dana R.",
  "Marcus T.",
  "Priya S.",
  "Old Man Hendricks",
  "The Corner Cafe",
  "Jamie L.",
  "Rosa & Sons Hardware",
  "Teri from the flea market",
  "Sam W.",
  "The Guptas next door",
  "Pastor Bill",
  "Lily's Flower Shop",
];

const hasAnySander = (gameState: GameState) =>
  ownsTool(gameState, "sandingBlock") ||
  ownsTool(gameState, "randomOrbitSander");

const hasAnySaw = (gameState: GameState) =>
  ownsMachine(gameState, "miterSaw") || ownsTool(gameState, "handSaw");

/**
 * An established shop's low-tier work arrives in bigger batches — the old
 * templates scale up with reputation instead of going stale.
 */
function repBatchBonus(gameState: GameState): number {
  return Math.min(6, Math.floor(gameState.reputation / 12));
}

/** The real-wood species the player can currently buy, across both stores. */
function buyableHardwoods(gameState: GameState): ReadonlyArray<Species> {
  const channels = [
    ...unlockedLumberChannels(gameState.reputation, "orangeBox"),
    ...unlockedLumberChannels(gameState.reputation, "lumberyard"),
  ];
  return [...new Set(channels.flatMap((channel) => channel.species))];
}

/** "walnut", "purple heart" — species ids in client-request language. */
function speciesLabel(species: Species): string {
  return humanizeString(species).toLowerCase();
}

/**
 * A hardwood product ask, sometimes narrowed to one specific buyable
 * species. The clause slots into the description ("a walnut cutting
 * board"); specific asks tip +1 reputation.
 */
function speciesRequest(
  rng: () => number,
  gameState: GameState,
): {
  readonly species: ReadonlyArray<Species>;
  readonly clause: string;
  readonly repBonus: number;
} {
  const buyable = buyableHardwoods(gameState);
  if (buyable.length > 0 && rng() < SPECIES_REQUEST_CHANCE) {
    const chosen = pick(rng, buyable);
    return {
      species: [chosen],
      clause: speciesLabel(chosen),
      repBonus: 1,
    };
  }
  return { species: REAL_WOOD_SPECIES, clause: "hardwood", repBonus: 0 };
}

/**
 * Everything here must stay producible from the capabilities its
 * `available` predicate checks — the pallet chain yields one board and
 * one only (36" × 4" × 4/4, rough), the miter saw cuts length, the table
 * saw rips width, sanders raise surface, the planer reduces thickness, and the
 * bench recipes assemble the products (see benchOperations.ts and the
 * hammer/drill tool recipes).
 */
const JOB_TEMPLATES: ReadonlyArray<JobTemplate> = [
  {
    // The guaranteed path back to solvency: free wood, starter tools, and
    // a build the shop can do from the first morning (the workspace ships
    // with a hammer mounted). Every job asks for something you made —
    // nobody buys loose boards.
    id: "rustic-shelves",
    tier: 0,
    zeroMaterialCost: true,
    available: () => true,
    generate: (rng, gameState) => {
      const quantity =
        intBetween(rng, 1, 2) +
        Math.min(3, Math.floor(repBatchBonus(gameState) / 2));
      return {
        description:
          quantity === 1
            ? "Looking for a rustic pallet-wood shelf for the garage. Rougher the better."
            : `Looking for ${quantity} rustic pallet-wood shelves. Rougher the better.`,
        requiredMaterials: [
          { type: ["rusticShelf"], species: ["pallet"], quantity },
        ],
        baseReputation: 1,
      };
    },
  },
  {
    id: "birdhouses",
    tier: 1,
    zeroMaterialCost: true,
    available: (gameState) =>
      hasSkill(gameState.progression, "rusticProjects") &&
      ownsTool(gameState, "hammer") &&
      hasAnySaw(gameState),
    generate: (rng, gameState) => {
      const quantity = intBetween(rng, 2, 4) + repBatchBonus(gameState);
      return {
        description: `Garden club here — we need ${quantity} birdhouses for the spring fair. Pallet wood is fine, the birds don't mind.`,
        requiredMaterials: [{ type: ["birdhouse"], quantity }],
        baseReputation: 1,
      };
    },
  },
  {
    id: "crates",
    tier: 1,
    zeroMaterialCost: true,
    available: (gameState) =>
      hasSkill(gameState.progression, "rusticProjects") &&
      ownsTool(gameState, "hammer"),
    generate: (rng, gameState) => {
      const quantity =
        intBetween(rng, 2, 3) + Math.min(3, repBatchBonus(gameState));
      return {
        description: `Need ${quantity} slatted crates for market-stall storage. Sturdy beats pretty.`,
        requiredMaterials: [{ type: ["crate"], quantity }],
        baseReputation: 1,
      };
    },
  },
  {
    // The starter shop's repeat business, and the one job that exercises
    // all three of its machines: mitered ends off the saw, 2" rails off
    // the rip fence, sanded before it goes together. Free pallet stock,
    // so it can anchor the board.
    id: "rustic-frames",
    tier: 2,
    zeroMaterialCost: true,
    available: (gameState) =>
      hasAnySaw(gameState) &&
      ownsMachine(gameState, "jobsiteTableSaw") &&
      hasAnySander(gameState),
    generate: (rng, gameState) => {
      const quantity =
        intBetween(rng, 1, 2) + Math.min(3, repBatchBonus(gameState));
      return {
        description:
          quantity === 1
            ? "Looking for a reclaimed-wood frame for a print. Mitered corners, sanded smooth."
            : `Need ${quantity} reclaimed-wood frames for my craft fair stall. Mitered corners, sanded smooth.`,
        requiredMaterials: [
          { type: ["rusticFrame"], species: ["pallet"], quantity },
        ],
        baseReputation: 2,
      };
    },
  },
  {
    // Screwed assembly: work for the drill. The wood is free pallet
    // stock, but the screws are bought — so it never anchors the board.
    // The box's slats are 2' crosscuts, so a saw has to be on hand too.
    id: "planter-boxes",
    tier: 2,
    zeroMaterialCost: false,
    available: (gameState) =>
      ownsTool(gameState, "drill") && hasAnySaw(gameState),
    generate: (rng) => {
      const quantity = intBetween(rng, 1, 2);
      return {
        description:
          quantity === 1
            ? "Want a pallet-wood planter box for my balcony herbs. Screwed together, please — it'll live outside."
            : "Looking for two matching pallet-wood planter boxes for the front steps.",
        requiredMaterials: [
          { type: ["planterBox"], species: ["pallet"], quantity },
        ],
        baseReputation: 2,
      };
    },
  },
  {
    id: "step-stools",
    tier: 2,
    zeroMaterialCost: false,
    available: (gameState) =>
      ownsTool(gameState, "drill") && hasAnySaw(gameState),
    generate: (rng) => {
      const quantity = intBetween(rng, 1, 2);
      return {
        description:
          quantity === 1
            ? "Need a step stool sturdy enough for the top shelf and the grandkids both."
            : "Need two step stools for the preschool sinks. Kid height, no splinters.",
        requiredMaterials: [{ type: ["stepStool"], quantity }],
        baseReputation: 2,
      };
    },
  },
  {
    // Hardwood work: requires bought lumber, so it's never the only job.
    id: "cutting-boards",
    tier: 4,
    zeroMaterialCost: false,
    available: (gameState) =>
      // The proper-cutting-board commission taught the glue-up chain
      hasCompletedCommission(gameState.progression, "proper-cutting-board"),
    generate: (rng, gameState) => {
      const quantity = intBetween(rng, 1, 2);
      const request = speciesRequest(rng, gameState);
      return {
        description:
          quantity === 1
            ? `Looking for a real ${request.clause} cutting board as a housewarming gift.`
            : `Need two ${request.clause} cutting boards — wedding season.`,
        requiredMaterials: [
          {
            type: ["simpleCuttingBoard"],
            species: request.species,
            quantity,
          },
        ],
        baseReputation: 3 + request.repBonus,
      };
    },
  },
  {
    // Precision work: offered once the player has learned the angle stops.
    id: "picture-frames",
    tier: 4,
    zeroMaterialCost: false,
    available: (gameState) => hasSkill(gameState.progression, "miteredFrames"),
    generate: (rng, gameState) => {
      const quantity = intBetween(rng, 1, 2);
      const request = speciesRequest(rng, gameState);
      return {
        description:
          quantity === 1
            ? `Want a ${request.clause} picture frame for our wedding photo. Tight miters, please.`
            : `Gallery around the corner — we need two matching ${request.clause} picture frames.`,
        requiredMaterials: [
          { type: ["pictureFrame"], species: request.species, quantity },
        ],
        baseReputation: 3 + request.repBonus,
      };
    },
  },
  {
    // Finished goods: the proper-cutting-board commission taught the
    // wipe-down along with the glue-up.
    id: "oiled-boards",
    tier: 5,
    zeroMaterialCost: false,
    available: (gameState) =>
      hasCompletedCommission(gameState.progression, "proper-cutting-board"),
    generate: (rng, gameState) => {
      const quantity = intBetween(rng, 1, 2);
      const request = speciesRequest(rng, gameState);
      return {
        description: `Kitchen shop restocking: ${quantity === 1 ? "one" : quantity} ${request.clause} cutting board${quantity === 1 ? "" : "s"}, oiled and ready to sell.`,
        requiredMaterials: [
          {
            type: ["simpleCuttingBoard"],
            species: request.species,
            finish: ["mineralOil"],
            quantity,
          },
        ],
        baseReputation: 3 + request.repBonus,
      };
    },
  },
  {
    id: "fine-shelves",
    tier: 5,
    zeroMaterialCost: false,
    available: (gameState) => hasSkill(gameState.progression, "fineShelving"),
    generate: (rng, gameState) => {
      const quantity = intBetween(rng, 1, 2);
      const request = speciesRequest(rng, gameState);
      return {
        description:
          quantity === 1
            ? `After a clean-lined ${request.clause} shelf for the living room.`
            : `Fitting out a boutique — need two matching ${request.clause} shelves.`,
        requiredMaterials: [
          { type: ["shelf"], species: request.species, quantity },
        ],
        baseReputation: 3 + request.repBonus,
      };
    },
  },
  {
    id: "jewelry-boxes",
    tier: 5,
    zeroMaterialCost: false,
    available: (gameState) => hasSkill(gameState.progression, "boxJoinery"),
    generate: (rng, gameState) => {
      const quantity = intBetween(rng, 1, 2);
      const request = speciesRequest(rng, gameState);
      return {
        description:
          quantity === 1
            ? `Looking for a ${request.clause} jewelry box — anniversary coming up.`
            : `Need two ${request.clause} jewelry boxes for our graduating twins.`,
        requiredMaterials: [
          { type: ["jewelryBox"], species: request.species, quantity },
        ],
        baseReputation: 3 + request.repBonus,
      };
    },
  },
  {
    id: "bookshelves",
    tier: 6,
    zeroMaterialCost: false,
    available: (gameState) =>
      hasSkill(gameState.progression, "fineShelving") &&
      ownsTool(gameState, "drill"),
    generate: (rng, gameState) => {
      const request = speciesRequest(rng, gameState);
      return {
        description: `Book collector in need of a proper ${request.clause} bookshelf. No wobble, no veneer.`,
        requiredMaterials: [
          { type: ["bookshelf"], species: request.species, quantity: 1 },
        ],
        baseReputation: 4 + request.repBonus,
      };
    },
  },
  {
    id: "frame-batch",
    tier: 6,
    zeroMaterialCost: false,
    available: (gameState) => hasSkill(gameState.progression, "miteredFrames"),
    generate: (rng, gameState) => {
      const quantity = intBetween(rng, 3, 4);
      const request = speciesRequest(rng, gameState);
      return {
        description: `Hanging a new show at the gallery: need ${quantity} matching ${request.clause} frames, all corners tight.`,
        requiredMaterials: [
          { type: ["pictureFrame"], species: request.species, quantity },
        ],
        baseReputation: 4 + request.repBonus,
      };
    },
  },
  {
    id: "hex-frames",
    tier: 6,
    zeroMaterialCost: false,
    available: (gameState) => hasSkill(gameState.progression, "polygonJoinery"),
    generate: (rng, gameState) => {
      const quantity = intBetween(rng, 1, 2);
      const request = speciesRequest(rng, gameState);
      return {
        description:
          quantity === 1
            ? `Want a hexagonal ${request.clause} frame for a macramé mirror. Six corners, no gaps.`
            : `Need two hexagonal ${request.clause} frames for the plant café wall.`,
        requiredMaterials: [
          { type: ["hexFrame"], species: request.species, quantity },
        ],
        baseReputation: 4 + request.repBonus,
      };
    },
  },
  {
    id: "striped-boards",
    tier: 6,
    zeroMaterialCost: false,
    available: (gameState) => hasSkill(gameState.progression, "stripedBoards"),
    generate: (rng, gameState) => {
      const buyable = buyableHardwoods(gameState);
      if (buyable.length >= 2 && rng() < SPECIES_REQUEST_CHANCE) {
        const first = pick(rng, buyable);
        const second = pick(
          rng,
          buyable.filter((species) => species !== first),
        );
        return {
          description: `Want a striped cutting board — ${speciesLabel(first)} and ${speciesLabel(second)}, strict alternation.`,
          requiredMaterials: [
            {
              type: ["stripedCuttingBoard"],
              species: [first, second],
              accentSpecies: [first, second],
              quantity: 1,
            },
          ],
          baseReputation: 5,
        };
      }
      return {
        description:
          "Want a striped two-wood cutting board. Dealer's choice on the woods — make them argue.",
        requiredMaterials: [{ type: ["stripedCuttingBoard"], quantity: 1 }],
        baseReputation: 4,
      };
    },
  },
  {
    id: "serving-trays",
    tier: 7,
    zeroMaterialCost: false,
    available: (gameState) => hasSkill(gameState.progression, "trayWork"),
    generate: (rng, gameState) => {
      const request = speciesRequest(rng, gameState);
      return {
        description: `Run a bed-and-breakfast, need a ${request.clause} serving tray — panel bottom, mitered rails, no rattles.`,
        requiredMaterials: [
          { type: ["servingTray"], species: request.species, quantity: 1 },
        ],
        baseReputation: 4 + request.repBonus,
      };
    },
  },
  {
    id: "sunrise-boards",
    tier: 7,
    zeroMaterialCost: false,
    available: (gameState) => hasSkill(gameState.progression, "sunriseBoards"),
    generate: () => {
      return {
        description:
          "Saw your sunrise board at the market. I want one — the fade, the whole thing.",
        requiredMaterials: [{ type: ["sunriseCuttingBoard"], quantity: 1 }],
        baseReputation: 5,
      };
    },
  },
  {
    id: "end-grain-boards",
    tier: 8,
    zeroMaterialCost: false,
    available: (gameState) => hasSkill(gameState.progression, "endGrainBoards"),
    generate: (rng, gameState) => {
      const request = speciesRequest(rng, gameState);
      return {
        description: `Chef looking for a true end-grain ${request.clause} block. Knife-friendly, heavy, forever.`,
        requiredMaterials: [
          {
            type: ["endGrainCuttingBoard"],
            species: request.species,
            quantity: 1,
          },
        ],
        baseReputation: 5 + request.repBonus,
      };
    },
  },
  {
    id: "side-tables",
    tier: 8,
    zeroMaterialCost: false,
    available: (gameState) =>
      hasSkill(gameState.progression, "furnitureBasics"),
    generate: (rng, gameState) => {
      const request = speciesRequest(rng, gameState);
      return {
        description: `Want a ${request.clause} side table — a wide glued top on square legs. Real furniture, none of that flat-pack.`,
        requiredMaterials: [
          { type: ["sideTable"], species: request.species, quantity: 1 },
        ],
        baseReputation: 6 + request.repBonus,
      };
    },
  },
  {
    id: "checkerboard-boards",
    tier: 9,
    zeroMaterialCost: false,
    available: (gameState) => hasSkill(gameState.progression, "checkerboards"),
    generate: () => {
      return {
        description:
          "Want a checkerboard end-grain board — two woods, every other block flipped. Go ahead and show off.",
        requiredMaterials: [
          { type: ["checkerboardCuttingBoard"], quantity: 1 },
        ],
        baseReputation: 6,
      };
    },
  },
];

/** The templates the player's current capabilities can fulfill. */
function availableTemplates(gameState: GameState): ReadonlyArray<JobTemplate> {
  return JOB_TEMPLATES.filter((template) => template.available(gameState));
}

/**
 * The ids of currently-available templates — stored on GameState after
 * each refresh so the next refresh knows which capabilities are new.
 */
export function availableJobTemplateIds(
  gameState: GameState,
): ReadonlyArray<string> {
  return availableTemplates(gameState).map((template) => template.id);
}

/** Fair value of everything a job asks for, via representative materials. */
function jobFairValue(
  requiredMaterials: ReadonlyArray<InputMaterialWithQuantity>,
): number {
  return requiredMaterials.reduce(
    (sum, requirement) =>
      sum +
      getSellValue(createMockMaterial(requirement)) * requirement.quantity,
    0,
  );
}

function makeOffer(
  template: JobTemplate,
  rng: () => number,
  gameState: GameState,
): JobOffer {
  const generated = template.generate(rng, gameState);
  const multiplier =
    JOB_PAY_MULTIPLIER_MIN +
    rng() * (JOB_PAY_MULTIPLIER_MAX - JOB_PAY_MULTIPLIER_MIN);
  return {
    id: `job-${makeJobId()}`,
    name: pick(rng, CLIENT_NAMES),
    description: generated.description,
    requiredMaterials: generated.requiredMaterials,
    basePay: roundToCents(
      jobFairValue(generated.requiredMaterials) * multiplier,
    ),
    baseReputation: generated.baseReputation,
    postedAtTick: gameState.tick,
    materialCostFree: template.zeroMaterialCost,
  };
}

/**
 * Weighted pick that skews toward the highest tier the player has
 * unlocked: weight = 1 + tier, plus reputation nudges bigger work — an
 * established shop's board grows out of pallet-board errands.
 */
function pickTemplate(
  rng: () => number,
  templates: ReadonlyArray<JobTemplate>,
  reputation: number,
): JobTemplate {
  const weights = templates.map(
    (template) => 1 + template.tier * (1 + reputation / 30),
  );
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = rng() * total;
  for (let i = 0; i < templates.length; i++) {
    roll -= weights[i];
    if (roll <= 0) {
      return templates[i];
    }
  }
  return templates[templates.length - 1];
}

/**
 * A fresh set of open offers for the daily board refresh. Three
 * guarantees shape the set before weighted picks fill it out:
 *
 * 1. Income floor: at least one zero-material-cost job, so a broke player
 *    always has a path back to solvency.
 * 2. New-capability burst: templates whose ids aren't in
 *    `seenJobTemplateIds` (word hasn't gotten around yet) each land one
 *    guaranteed offer, up to two — new gear brings work immediately.
 * 3. Top-tier guarantee: at least one offer from the highest available
 *    tier, so the board always shows the player's best work is wanted.
 */
export function generateJobBoard(
  gameState: GameState,
  rng: () => number = Math.random,
): JobOffer[] {
  const available = availableTemplates(gameState);
  const count = intBetween(rng, JOB_BOARD_MIN_OFFERS, JOB_BOARD_MAX_OFFERS);
  const chosen: JobTemplate[] = [];

  const zeroCost = available.filter((template) => template.zeroMaterialCost);
  chosen.push(pick(rng, zeroCost));

  const unseen = available.filter(
    (template) => !gameState.seenJobTemplateIds.includes(template.id),
  );
  for (const template of unseen.slice(0, 2)) {
    if (!chosen.includes(template)) {
      chosen.push(template);
    }
  }

  const topTier = Math.max(...available.map((template) => template.tier));
  if (!chosen.some((template) => template.tier === topTier)) {
    chosen.push(
      pick(
        rng,
        available.filter((template) => template.tier === topTier),
      ),
    );
  }

  while (chosen.length < count) {
    chosen.push(pickTemplate(rng, available, gameState.reputation));
  }

  return chosen.map((template) => makeOffer(template, rng, gameState));
}
