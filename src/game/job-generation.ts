import { GameState, JobOffer } from "./GameState";
import { InputMaterialWithQuantity } from "./Machine";
import { createMockMaterial } from "./material-helpers";
import { getSellValue } from "./material-values";
import { roundToCents } from "./marketplace";
import { ownsMachine, ownsTool } from "./progression-helpers";
import { hasSkill } from "./skill-helpers";
import { BoardDimension, REAL_WOOD_SPECIES } from "./Materials";
import { idMaker } from "../utils/idMaker";

const makeJobId = idMaker();

/**
 * Job generation (see docs/marketplace-and-jobs.md). Offers come from the
 * player's capability envelope — what they can actually build right now —
 * so the board never asks for the impossible, and it skews toward the most
 * advanced capability so new equipment immediately brings matching work.
 */

/** The board holds this many open offers after a refresh. */
export const JOB_BOARD_MIN_OFFERS = 3;
export const JOB_BOARD_MAX_OFFERS = 5;

/** Jobs pay a guaranteed multiple of the deliverables' fair value. */
const JOB_PAY_MULTIPLIER_MIN = 1.5;
const JOB_PAY_MULTIPLIER_MAX = 2.0;

interface JobTemplate {
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
  readonly generate: (rng: () => number) => GeneratedJob;
}

interface GeneratedJob {
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

/**
 * Everything here must stay producible from the capabilities its
 * `available` predicate checks — the pallet chain yields 3×4×1 deck boards
 * and 4×6×3 stringers, the miter saw cuts length, the table saw rips
 * width, sanders raise surface, the planer reduces thickness.
 */
const JOB_TEMPLATES: ReadonlyArray<JobTemplate> = [
  {
    // The guaranteed path back to solvency: free wood, starter tools.
    tier: 0,
    zeroMaterialCost: true,
    available: () => true,
    generate: (rng) => {
      const quantity = intBetween(rng, 3, 6);
      return {
        description: `Needs ${quantity} reclaimed pallet boards for a weekend project. Any condition.`,
        requiredMaterials: [
          {
            type: ["board"],
            species: ["pallet"],
            length: [3],
            width: [4],
            thickness: [1],
            quantity,
          },
        ],
        baseReputation: 1,
      };
    },
  },
  {
    tier: 0,
    zeroMaterialCost: true,
    available: () => true,
    generate: (rng) => {
      const quantity = intBetween(rng, 1, 2);
      return {
        description:
          quantity === 1
            ? "Wants a rustic pallet-wood shelf for the garage. Rougher the better."
            : "Wants a pair of rustic pallet-wood shelves. Rougher the better.",
        requiredMaterials: [
          { type: ["rusticShelf"], species: ["pallet"], quantity },
        ],
        baseReputation: 1,
      };
    },
  },
  {
    tier: 1,
    zeroMaterialCost: true,
    available: (gameState) => ownsMachine(gameState, "miterSaw"),
    generate: (rng) => {
      const length = pick(rng, [1, 2] as const) satisfies BoardDimension;
      const quantity = intBetween(rng, 3, 6);
      return {
        description: `Needs ${quantity} pallet boards crosscut to ${length}' exactly. Bring your miter saw game.`,
        requiredMaterials: [
          {
            type: ["board"],
            species: ["pallet"],
            length: [length],
            width: [4],
            thickness: [1],
            quantity,
          },
        ],
        baseReputation: 1,
      };
    },
  },
  {
    tier: 1,
    zeroMaterialCost: true,
    available: (gameState) => ownsMachine(gameState, "jobsiteTableSaw"),
    generate: (rng) => {
      const width = pick(rng, [1, 2] as const) satisfies BoardDimension;
      const quantity = intBetween(rng, 3, 6);
      return {
        description: `Needs ${quantity} slats ripped to ${width}" wide from pallet stock.`,
        requiredMaterials: [
          {
            type: ["board"],
            species: ["pallet"],
            length: [3],
            width: [width],
            thickness: [1],
            quantity,
          },
        ],
        baseReputation: 1,
      };
    },
  },
  {
    tier: 2,
    zeroMaterialCost: true,
    available: hasAnySander,
    generate: (rng) => {
      const quantity = intBetween(rng, 2, 4);
      return {
        description: `Needs ${quantity} pallet boards sanded baby-smooth for a craft project.`,
        requiredMaterials: [
          {
            type: ["board"],
            species: ["pallet"],
            length: [3],
            width: [4],
            thickness: [1],
            surface: ["sanded"],
            quantity,
          },
        ],
        baseReputation: 2,
      };
    },
  },
  {
    tier: 3,
    zeroMaterialCost: true,
    available: (gameState) => ownsMachine(gameState, "lunchboxPlaner"),
    generate: (rng) => {
      const quantity = intBetween(rng, 2, 3);
      return {
        description: `Needs ${quantity} pallet stringers planed down to 2/4 thickness. Smooth faces, please.`,
        requiredMaterials: [
          {
            type: ["board"],
            species: ["pallet"],
            length: [4],
            width: [6],
            thickness: [2],
            surface: ["smooth", "sanded"],
            quantity,
          },
        ],
        baseReputation: 2,
      };
    },
  },
  {
    // Screwed assembly: work for the drill. The wood is free pallet
    // stock, but the screws are bought — so it never anchors the board.
    // The box's slats are 2' crosscuts, so a saw has to be on hand too.
    tier: 2,
    zeroMaterialCost: false,
    available: (gameState) =>
      ownsTool(gameState, "drill") &&
      (ownsMachine(gameState, "miterSaw") || ownsTool(gameState, "handSaw")),
    generate: (rng) => {
      const quantity = intBetween(rng, 1, 2);
      return {
        description:
          quantity === 1
            ? "Wants a pallet-wood planter box for the balcony herbs. Screwed together, please — it'll live outside."
            : "Wants two matching pallet-wood planter boxes for the front steps.",
        requiredMaterials: [
          { type: ["planterBox"], species: ["pallet"], quantity },
        ],
        baseReputation: 2,
      };
    },
  },
  {
    // Hardwood work: requires bought lumber, so it's never the only job.
    tier: 4,
    zeroMaterialCost: false,
    available: (gameState) =>
      // The proper-cutting-board commission taught the glue-up chain
      gameState.progression.commissionsCompleted >= 6,
    generate: (rng) => {
      const quantity = intBetween(rng, 1, 2);
      return {
        description:
          quantity === 1
            ? "Wants a real hardwood cutting board as a housewarming gift."
            : "Wants two hardwood cutting boards — wedding season.",
        requiredMaterials: [
          {
            type: ["simpleCuttingBoard"],
            species: REAL_WOOD_SPECIES,
            quantity,
          },
        ],
        baseReputation: 3,
      };
    },
  },
  {
    // Precision work: offered once the player has learned the angle stops.
    tier: 4,
    zeroMaterialCost: false,
    available: (gameState) => hasSkill(gameState.progression, "miteredFrames"),
    generate: (rng) => {
      const quantity = intBetween(rng, 1, 2);
      return {
        description:
          quantity === 1
            ? "Wants a hardwood picture frame for a wedding photo. Tight miters, please."
            : "The gallery around the corner needs two matching hardwood picture frames.",
        requiredMaterials: [
          { type: ["pictureFrame"], species: REAL_WOOD_SPECIES, quantity },
        ],
        baseReputation: 3,
      };
    },
  },
];

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
  tick: number,
): JobOffer {
  const generated = template.generate(rng);
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
    postedAtTick: tick,
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
 * A fresh set of open offers for the daily board refresh. Always includes
 * at least one zero-material-cost job, so a broke player always has a path
 * back to solvency.
 */
export function generateJobBoard(
  gameState: GameState,
  rng: () => number = Math.random,
): JobOffer[] {
  const available = JOB_TEMPLATES.filter((template) =>
    template.available(gameState),
  );
  const count = intBetween(rng, JOB_BOARD_MIN_OFFERS, JOB_BOARD_MAX_OFFERS);
  const offers: JobOffer[] = [];

  const zeroCost = available.filter((template) => template.zeroMaterialCost);
  offers.push(makeOffer(pick(rng, zeroCost), rng, gameState.tick));

  while (offers.length < count) {
    const template = pickTemplate(rng, available, gameState.reputation);
    offers.push(makeOffer(template, rng, gameState.tick));
  }
  return offers;
}
