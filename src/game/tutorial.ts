import { PALLET_BOARD_LENGTH_IN } from "./bench-work/pallet-geometry";
import { hasOneMiteredEnd, isBoard } from "./board-helpers";
import { GameState } from "./GameState";
import { MachineId } from "./Machine";
import { Board, MaterialInstance } from "./Materials";
import { formatMoney } from "../utils/formatNumber";
import { ownsTool } from "./progression-helpers";
import { hasSkill } from "./skill-helpers";

/**
 * The guided opening: the character's own to-do list, a card of goals
 * with checkboxes, derived from the shop rather than scripted. Each
 * sub-step is a predicate over GameState; a box is checked when its
 * predicate holds (or the walk already passed it), the first unchecked
 * box is what the coach points at, and `advanceTutorialStep` walks the
 * flat index forward inside the milestone pass.
 *
 * Two properties fall out of that, and both are the point:
 *
 * - It cannot desync. A player who wanders off, does a step early, or
 *   reloads mid-pallet still sees whatever is genuinely next, because the
 *   step is recomputed from durable state and never from what the UI
 *   thinks happened.
 * - It cannot lock. Nothing here gates input — the coach points, the
 *   player acts, and every predicate reads a condition the player can
 *   always reach again (scavenging is free and unlimited, and the stand
 *   sells whatever gets set out on it).
 *
 * The prose lives in TutorialCard, not here, so instructions can name
 * their keys through the shortcut registry instead of hard-coding glyphs.
 * This file owns goal titles, checkbox labels, targets, and predicates.
 *
 * It ends deliberately at the money goal — from there the reputation
 * gates pace the shop's growth. Skip is one flag (`tutorialDismissed`),
 * always offered, never punished.
 */

export const TUTORIAL_STEP_IDS = [
  "scavenge",
  "dismantle",
  "buildShelf",
  "sellShelf",
  "learnSkill",
  "goToStore",
  "addSawToCart",
  "checkOut",
  "gatherWood",
  "mountSaw",
  "cutParts",
  "assembleBirdhouse",
  "earnSavings",
] as const;
export type TutorialStepId = (typeof TUTORIAL_STEP_IDS)[number];

export const TUTORIAL_GOAL_IDS = ["firstItem", "birdhouse", "savings"] as const;
export type TutorialGoalId = (typeof TUTORIAL_GOAL_IDS)[number];

/**
 * Chrome a step can point at, marked with `data-tutorial-target`. Measured
 * from the DOM at highlight time the way reward flights measure their
 * targets — a target that isn't mounted (the phone is closed, the store
 * aisle isn't open) simply doesn't light up, which is not an error.
 */
export const TUTORIAL_DOM_TARGET_IDS = [
  "navbar-journal",
  "store-tool-handSaw",
  "store-checkout",
  "skill-rusticProjects",
] as const;
export type TutorialDomTargetId = (typeof TUTORIAL_DOM_TARGET_IDS)[number];

export const TUTORIAL_TARGET_ATTRIBUTE = "data-tutorial-target";

/** Something in the world or on the screen the current step points at. */
export type TutorialTarget =
  | { readonly kind: "machine"; readonly machineTypeId: MachineId }
  | { readonly kind: "truck"; readonly part: "cab" | "bed" }
  | { readonly kind: "stand" }
  | {
      readonly kind: "pile";
      readonly match: (material: MaterialInstance) => boolean;
    }
  | { readonly kind: "dom"; readonly id: TutorialDomTargetId };

export interface TutorialStep {
  readonly id: TutorialStepId;
  /** The checkbox line on the to-do card, short enough to stay one line. */
  readonly label: string;
  /** What lights up while this step is the first unchecked box. */
  readonly targets: ReadonlyArray<TutorialTarget>;
  /** True once the player has done the thing. Never un-satisfies. */
  readonly satisfied: (gameState: GameState) => boolean;
}

/** One entry on the to-do list: a goal and the steps that achieve it. */
export interface TutorialGoal {
  readonly id: TutorialGoalId;
  /** The heading the checkboxes sit under. */
  readonly title: string;
  readonly steps: ReadonlyArray<TutorialStep>;
}

// ---------------------------------------------------------------------------
// Reading the shop
// ---------------------------------------------------------------------------

/**
 * Every loose piece the player could be said to have: in hand, on the
 * floor, sitting on a machine's shelf or in its bay, or riding in the bed.
 * Deliberately broad — a step asking "do you have a shelf yet" shouldn't
 * care that it's still lying in the bench's output bay.
 */
export function shopMaterials(
  gameState: GameState,
): ReadonlyArray<MaterialInstance> {
  return [
    ...gameState.player.inventory,
    ...gameState.materialPiles.map((pile) => pile.material),
    ...gameState.machines.flatMap((machine) => [
      ...(machine.storedMaterials ?? []),
      ...(machine.inputMaterials ?? []),
      ...(machine.outputMaterials ?? []),
    ]),
    ...gameState.truck.bed,
    ...gameState.stand,
  ];
}

const isPallet = (material: MaterialInstance) => material.type === "pallet";

const isRusticShelf = (material: MaterialInstance) =>
  material.type === "rusticShelf";

const isBirdhouse = (material: MaterialInstance) =>
  material.type === "birdhouse";

/** A board off a pallet — the one piece of stock a pallet is made of. */
const isPalletBoard = (material: MaterialInstance): boolean =>
  material.type === "board" && (material as Board).species === "pallet";

/** A pallet board still at its pried length, uncut. */
const isFullPalletBoard = (material: MaterialInstance): boolean =>
  isPalletBoard(material) &&
  (material as Board).length >= PALLET_BOARD_LENGTH_IN;

const countOf = (
  gameState: GameState,
  match: (material: MaterialInstance) => boolean,
): number => shopMaterials(gameState).filter(match).length;

/** The parts a rustic shelf is built from: six whole pallet boards, one
 * per slot of RUSTIC_SHELF_BLUEPRINT. Stated here rather than read off
 * the blueprint — this module stays clear of the blueprint/tool registry
 * so it can be imported from anywhere; the sequence test walks the real
 * build and would catch the two drifting apart. */
const SHELF_BOARD_COUNT = 6;

/** The birdhouse's cut list, every piece a crosscut of a pallet board:
 * two 12" fronts with one end mitered 45°, a 12" roof, a 12" floor, and
 * two 6" side walls. Stated here for the same reason as
 * SHELF_BOARD_COUNT; two full pallet boards cover it. */
const BIRDHOUSE_PART_LENGTH_IN = 12;
const BIRDHOUSE_SIDE_LENGTH_IN = 6;
const BIRDHOUSE_MITERED_COUNT = 2;
const BIRDHOUSE_TWELVES_COUNT = 4;
const BIRDHOUSE_SIDES_COUNT = 2;
const BIRDHOUSE_BOARDS_NEEDED = 2;

const hasShelfParts = (gameState: GameState) =>
  countOf(gameState, isPalletBoard) >= SHELF_BOARD_COUNT;

const hasShelf = (gameState: GameState) =>
  countOf(gameState, isRusticShelf) > 0;

const hasBirdhouse = (gameState: GameState) =>
  countOf(gameState, isBirdhouse) > 0;

const soldFirstPiece = (gameState: GameState) =>
  gameState.progression.salesCompleted > 0;

/**
 * Whether the shop has yet to see its first pallet in any form — no
 * pallet, none of its boards, no shelf, no sale. The scavenge step reads
 * this, and so does startScavengingAction: while it holds, a scavenging
 * trip plants its find at the first stop, so the trip the card points
 * at can't come home empty.
 */
export const needsFirstPallet = (gameState: GameState): boolean =>
  countOf(gameState, isPallet) === 0 &&
  !hasShelfParts(gameState) &&
  !hasShelf(gameState) &&
  !soldFirstPiece(gameState);

const isBirdhousePartStock = (material: MaterialInstance): material is Board =>
  isPalletBoard(material) && isBoard(material);

const hasBirdhouseParts = (gameState: GameState): boolean => {
  const parts = shopMaterials(gameState).filter(isBirdhousePartStock);
  const twelves = parts.filter(
    (board) => board.length === BIRDHOUSE_PART_LENGTH_IN,
  );
  const mitered = twelves.filter((board) => hasOneMiteredEnd(board, 45));
  const sides = parts.filter(
    (board) => board.length === BIRDHOUSE_SIDE_LENGTH_IN,
  );
  return (
    mitered.length >= BIRDHOUSE_MITERED_COUNT &&
    twelves.length >= BIRDHOUSE_TWELVES_COUNT &&
    sides.length >= BIRDHOUSE_SIDES_COUNT
  );
};

/** Enough wood on hand for the birdhouse's cut list, in any state of
 * progress: a whole pallet, enough uncut boards, the parts themselves, or
 * the finished piece. */
const hasBirdhouseWood = (gameState: GameState): boolean =>
  countOf(gameState, isPallet) > 0 ||
  countOf(gameState, isFullPalletBoard) >= BIRDHOUSE_BOARDS_NEEDED ||
  hasBirdhouseParts(gameState) ||
  hasBirdhouse(gameState);

const isHandSawItem = (material: MaterialInstance) =>
  material.type === "tool" && material.toolId === "handSaw";

const shoppingCart = (gameState: GameState) =>
  gameState.player.away?.kind === "shopping"
    ? gameState.player.away.cart
    : null;

const sawInCart = (gameState: GameState): boolean =>
  (shoppingCart(gameState) ?? []).some(
    (line) => line.kind === "material" && isHandSawItem(line.material),
  );

const hasSaw = (gameState: GameState) => ownsTool(gameState, "handSaw");

const sawMounted = (gameState: GameState) =>
  gameState.machines.some((machine) => machine.tools.includes("handSaw"));

/** The savings goal that ends the opening. */
export const TUTORIAL_MONEY_GOAL = 300;

const reachedMoneyGoal = (gameState: GameState) =>
  gameState.money >= TUTORIAL_MONEY_GOAL;

// ---------------------------------------------------------------------------
// The goals
// ---------------------------------------------------------------------------

/**
 * Each predicate is written cumulatively — "this step's product exists, or
 * something only a later step could have produced does". A player who gets
 * ahead of the coach (dismantles a second pallet before the card catches
 * up, sets out work before it says to) skips forward instead of stranding
 * it on a condition that has already come and gone. The money goal is the
 * terminal fallback: a shop that saved up past it has outgrown the list.
 */
export const TUTORIAL_GOALS: ReadonlyArray<TutorialGoal> = [
  {
    id: "firstItem",
    title: "Make my first item",
    steps: [
      {
        id: "scavenge",
        label: "Scavenge a pallet",
        targets: [{ kind: "truck", part: "cab" }],
        satisfied: (gameState) => !needsFirstPallet(gameState),
      },
      {
        id: "dismantle",
        label: "Pry it apart at the workbench",
        targets: [
          { kind: "pile", match: isPallet },
          { kind: "machine", machineTypeId: "workspace" },
        ],
        satisfied: (gameState) =>
          hasShelfParts(gameState) ||
          hasShelf(gameState) ||
          soldFirstPiece(gameState),
      },
      {
        id: "buildShelf",
        label: "Build a rustic shelf",
        targets: [{ kind: "machine", machineTypeId: "workspace" }],
        satisfied: (gameState) =>
          hasShelf(gameState) || soldFirstPiece(gameState),
      },
      {
        // Satisfied by the sale, not the set-out: the next goal starts at
        // the store, and the store is what the first sale unlocks — so
        // the list holds here until the money exists to spend.
        id: "sellShelf",
        label: "Set it out at the stand",
        targets: [{ kind: "stand" }],
        satisfied: soldFirstPiece,
      },
    ],
  },
  {
    id: "birdhouse",
    title: "Build a birdhouse",
    steps: [
      {
        id: "learnSkill",
        label: "Research Rustic Projects",
        targets: [
          { kind: "dom", id: "navbar-journal" },
          { kind: "dom", id: "skill-rusticProjects" },
        ],
        satisfied: (gameState) =>
          hasSkill(gameState.progression, "rusticProjects") ||
          reachedMoneyGoal(gameState),
      },
      {
        id: "goToStore",
        label: "Drive to the Orange Box",
        targets: [{ kind: "truck", part: "cab" }],
        satisfied: (gameState) =>
          (gameState.player.away?.kind === "shopping" &&
            gameState.player.away.store === "orangeBox") ||
          sawInCart(gameState) ||
          hasSaw(gameState) ||
          reachedMoneyGoal(gameState),
      },
      {
        id: "addSawToCart",
        label: "Put a hand saw in the cart",
        targets: [{ kind: "dom", id: "store-tool-handSaw" }],
        satisfied: (gameState) =>
          sawInCart(gameState) ||
          hasSaw(gameState) ||
          reachedMoneyGoal(gameState),
      },
      {
        id: "checkOut",
        label: "Check out and head home",
        targets: [{ kind: "dom", id: "store-checkout" }],
        satisfied: (gameState) =>
          (hasSaw(gameState) && gameState.player.away?.kind !== "shopping") ||
          reachedMoneyGoal(gameState),
      },
      {
        id: "gatherWood",
        label: "Scavenge another pallet if needed",
        targets: [{ kind: "truck", part: "cab" }],
        satisfied: (gameState) =>
          hasBirdhouseWood(gameState) || reachedMoneyGoal(gameState),
      },
      {
        id: "mountSaw",
        label: "Mount the saw at the workbench",
        targets: [
          { kind: "pile", match: isHandSawItem },
          { kind: "machine", machineTypeId: "workspace" },
        ],
        satisfied: (gameState) =>
          sawMounted(gameState) ||
          hasBirdhouseParts(gameState) ||
          hasBirdhouse(gameState) ||
          reachedMoneyGoal(gameState),
      },
      {
        id: "cutParts",
        label: "Cut the parts to length",
        targets: [{ kind: "machine", machineTypeId: "workspace" }],
        satisfied: (gameState) =>
          hasBirdhouseParts(gameState) ||
          hasBirdhouse(gameState) ||
          reachedMoneyGoal(gameState),
      },
      {
        id: "assembleBirdhouse",
        label: "Nail the birdhouse together",
        targets: [{ kind: "machine", machineTypeId: "workspace" }],
        satisfied: (gameState) =>
          hasBirdhouse(gameState) || reachedMoneyGoal(gameState),
      },
    ],
  },
  {
    id: "savings",
    title: "Make some money",
    steps: [
      {
        id: "earnSavings",
        label: `Sell my work — save up ${formatMoney(TUTORIAL_MONEY_GOAL)}`,
        targets: [{ kind: "stand" }],
        satisfied: reachedMoneyGoal,
      },
    ],
  },
];

/** The goals flattened to the walk order the stored index counts in. */
export const TUTORIAL_STEPS: ReadonlyArray<TutorialStep> =
  TUTORIAL_GOALS.flatMap((goal) => goal.steps);

/** The index that means "every step is done". */
export const TUTORIAL_COMPLETE = TUTORIAL_STEPS.length;

/**
 * Walk the step index past everything the shop already satisfies. Called
 * from the milestone pass, which runs every tick, so the card keeps up
 * with whatever the player did without any action needing to know the
 * tutorial exists.
 */
export function advanceTutorialStep(gameState: GameState): number {
  let step = gameState.progression.tutorialStep;
  while (
    step < TUTORIAL_STEPS.length &&
    TUTORIAL_STEPS[step].satisfied(gameState)
  ) {
    step++;
  }
  return step;
}

/** The step the coach is currently on, or null once it's done or skipped. */
export function currentTutorialStep(gameState: GameState): TutorialStep | null {
  if (gameState.progression.tutorialDismissed) return null;
  return TUTORIAL_STEPS[gameState.progression.tutorialStep] ?? null;
}

/** The to-do card's view of the current goal: its steps and which boxes
 * are checked right now. */
export interface TutorialGoalView {
  readonly goal: TutorialGoal;
  /** Aligned with goal.steps: passed by the walk, or satisfied live. */
  readonly checked: ReadonlyArray<boolean>;
}

/**
 * The goal holding the current step, with each box's checked state. A box
 * is checked once the walk has passed it — the walk only moves forward,
 * so a condition that has come and gone (the pallet that got pried, the
 * store trip that ended) stays checked — or while its predicate holds,
 * so work done ahead of the coach shows up immediately.
 */
export function currentTutorialGoalView(
  gameState: GameState,
): TutorialGoalView | null {
  const step = currentTutorialStep(gameState);
  if (step === null) return null;
  const goal = TUTORIAL_GOALS.find((g) => g.steps.includes(step));
  if (goal === undefined) return null;
  const walkFrontier = gameState.progression.tutorialStep;
  return {
    goal,
    checked: goal.steps.map(
      (s) => TUTORIAL_STEPS.indexOf(s) < walkFrontier || s.satisfied(gameState),
    ),
  };
}
