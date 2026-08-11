import { GameState } from "./GameState";
import { MachineId } from "./Machine";
import { Board, MaterialInstance } from "./Materials";
import { ownsTool } from "./progression-helpers";
import { hasSkill } from "./skill-helpers";

/**
 * The guided opening. One instruction at a time,
 * derived from the shop rather than scripted: the current step is the
 * first one whose `satisfied` predicate is still false, and
 * `advanceTutorialStep` walks the index forward inside the milestone pass.
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
 * This file owns only ids, targets, and predicates.
 *
 * It stops deliberately at the first learned skill — from there the
 * reputation gates pace the shop's growth. Skip is one flag
 * (`tutorialDismissed`), always offered, never punished.
 */

export const TUTORIAL_STEP_IDS = [
  "scavenge",
  "dismantle",
  "buildShelf",
  "sellShelf",
  "buySandingBlock",
  "mountSandingBlock",
  "learnSkill",
] as const;
export type TutorialStepId = (typeof TUTORIAL_STEP_IDS)[number];

/**
 * Chrome a step can point at, marked with `data-tutorial-target`. Measured
 * from the DOM at highlight time the way reward flights measure their
 * targets — a target that isn't mounted (the phone is closed, the store
 * aisle isn't open) simply doesn't light up, which is not an error.
 */
export const TUTORIAL_DOM_TARGET_IDS = [
  "navbar-journal",
  "store-tool-sandingBlock",
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
  /** The instruction, short enough to sit on the card's header line. */
  readonly title: string;
  /** What lights up while this step is current. */
  readonly targets: ReadonlyArray<TutorialTarget>;
  /** True once the player has done the thing. Never un-satisfies. */
  readonly satisfied: (gameState: GameState) => boolean;
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

/** A board off a pallet — the one piece of stock a pallet is made of. */
const isPalletBoard = (material: MaterialInstance): boolean =>
  material.type === "board" && (material as Board).species === "pallet";

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

const hasShelfParts = (gameState: GameState) =>
  countOf(gameState, isPalletBoard) >= SHELF_BOARD_COUNT;

const hasShelf = (gameState: GameState) =>
  countOf(gameState, isRusticShelf) > 0;

const soldFirstPiece = (gameState: GameState) =>
  gameState.progression.salesCompleted > 0;

// ---------------------------------------------------------------------------
// The steps
// ---------------------------------------------------------------------------

/**
 * Each predicate is written cumulatively — "this step's product exists, or
 * something only a later step could have produced does". A player who gets
 * ahead of the coach (dismantles a second pallet before the card catches
 * up, delivers before it says to) skips forward instead of stranding it on
 * a condition that has already come and gone.
 */
export const TUTORIAL_STEPS: ReadonlyArray<TutorialStep> = [
  {
    id: "scavenge",
    title: "Take the truck out for a pallet",
    targets: [{ kind: "truck", part: "cab" }],
    satisfied: (gameState) =>
      countOf(gameState, isPallet) > 0 ||
      hasShelfParts(gameState) ||
      hasShelf(gameState) ||
      soldFirstPiece(gameState),
  },
  {
    id: "dismantle",
    title: "Pry the pallet apart at the workbench",
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
    title: "Build the rustic shelf",
    targets: [{ kind: "machine", machineTypeId: "workspace" }],
    satisfied: (gameState) => hasShelf(gameState) || soldFirstPiece(gameState),
  },
  {
    // Satisfied by the sale, not the set-out: the next card sends the
    // player to the store, and the store is what the first sale unlocks
    // — so the coach holds here until the money exists to spend.
    id: "sellShelf",
    title: "Set the shelf out at the for-sale stand",
    targets: [{ kind: "stand" }],
    satisfied: soldFirstPiece,
  },
  {
    id: "buySandingBlock",
    title: "Drive to the Orange Box for a sanding block",
    targets: [
      { kind: "truck", part: "cab" },
      { kind: "dom", id: "store-tool-sandingBlock" },
    ],
    satisfied: (gameState) => ownsTool(gameState, "sandingBlock"),
  },
  {
    id: "mountSandingBlock",
    title: "Mount the sanding block on the workbench",
    targets: [{ kind: "machine", machineTypeId: "workspace" }],
    satisfied: (gameState) =>
      gameState.machines.some((machine) =>
        machine.tools.includes("sandingBlock"),
      ),
  },
  {
    id: "learnSkill",
    title: "Spend your skill point in the journal",
    targets: [
      { kind: "dom", id: "navbar-journal" },
      { kind: "dom", id: "skill-rusticProjects" },
    ],
    satisfied: (gameState) => hasSkill(gameState.progression, "rusticProjects"),
  },
];

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
