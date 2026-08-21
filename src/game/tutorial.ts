import { PALLET_BOARD_LENGTH_IN } from "./bench-work/pallet-geometry";
import { hasOneMiteredEnd, isBoard } from "./board-helpers";
import { dustTotal } from "./Dust";
import { TutorialFacts, TutorialTrackId, TutorialTrackProgress } from "./GameState";
import { MachineId } from "./Machine";
import { Board, MaterialInstance } from "./Materials";
import { formatMoney } from "../utils/formatNumber";
import { ownsTool } from "./progression-helpers";
import { hasSkill } from "./skill-helpers";

/**
 * The tutorials: the character's own to-do lists, cards of goals with
 * checkboxes, derived from the shop rather than scripted. Each card is a
 * track — the guided opening that starts every new game, and the sweeping
 * lesson that goes up once the floor first gets properly dusty — and each
 * sub-step is a predicate over GameState; a box is checked when its
 * predicate holds (or the walk already passed it), the first unchecked
 * box of every up card is what the coach points at, and `advanceTutorials`
 * walks each track's flat index forward inside the milestone pass.
 *
 * Two properties fall out of that, and both are the point:
 *
 * - It cannot desync. A player who wanders off, does a step early, or
 *   reloads mid-pallet still sees whatever is genuinely next, because the
 *   step is recomputed from durable state and never from what the UI
 *   thinks happened.
 * - It cannot lock. Nothing here gates input — the coach points, the
 *   player acts, and every predicate reads a condition the player can
 *   always reach again (scavenging is free and unlimited, the stand
 *   sells whatever gets set out on it, and dusty machines keep making
 *   dust).
 *
 * The prose lives in TutorialCard, not here, so instructions can name
 * their keys through the shortcut registry instead of hard-coding glyphs.
 * This file owns track begin conditions, goal titles, checkbox labels,
 * targets, and predicates.
 *
 * The opening ends deliberately at the money goal — from there the
 * reputation gates pace the shop's growth. Skip is one flag per track
 * (`tutorials[id].dismissed`), always offered, never punished.
 */

export const TUTORIAL_STEP_IDS = [
  "scavenge",
  "dismantle",
  "buildShelf",
  "sellShelf",
  "firstSale",
  "learnSkill",
  "goToStore",
  "grabCart",
  "addSawToCart",
  "checkOut",
  "gatherWood",
  "mountSaw",
  "cutParts",
  "assembleBirdhouse",
  "earnSavings",
  "getBroom",
  "sweepUp",
  "emptyPan",
] as const;
export type TutorialStepId = (typeof TUTORIAL_STEP_IDS)[number];

export const TUTORIAL_GOAL_IDS = [
  "firstItem",
  "birdhouse",
  "savings",
  "sweepFloor",
] as const;
export type TutorialGoalId = (typeof TUTORIAL_GOAL_IDS)[number];

/**
 * Chrome a step can point at, marked with `data-tutorial-target`. Measured
 * from the DOM at highlight time the way reward flights measure their
 * targets — a target that isn't mounted (the phone is closed, the store
 * aisle isn't open) simply doesn't light up, which is not an error.
 */
export const TUTORIAL_DOM_TARGET_IDS = [
  "navbar-journal",
  "store-corral",
  "store-tool-handSaw",
  "store-tool-broom",
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
  | { readonly kind: "broom" }
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
  readonly satisfied: (gameState: TutorialFacts) => boolean;
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
  gameState: TutorialFacts,
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
  gameState: TutorialFacts,
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

const hasShelfParts = (gameState: TutorialFacts) =>
  countOf(gameState, isPalletBoard) >= SHELF_BOARD_COUNT;

const hasShelf = (gameState: TutorialFacts) =>
  countOf(gameState, isRusticShelf) > 0;

const hasBirdhouse = (gameState: TutorialFacts) =>
  countOf(gameState, isBirdhouse) > 0;

const soldFirstPiece = (gameState: TutorialFacts) =>
  gameState.progression.salesCompleted > 0;

/**
 * Whether the shop has yet to see its first pallet in any form — no
 * pallet, none of its boards, no shelf, no sale. The scavenge step reads
 * this, and so does startScavengingAction: while it holds, a scavenging
 * trip plants its find at the first stop, so the trip the card points
 * at can't come home empty.
 */
export const needsFirstPallet = (gameState: TutorialFacts): boolean =>
  countOf(gameState, isPallet) === 0 &&
  !hasShelfParts(gameState) &&
  !hasShelf(gameState) &&
  !soldFirstPiece(gameState);

const isBirdhousePartStock = (material: MaterialInstance): material is Board =>
  isPalletBoard(material) && isBoard(material);

const hasBirdhouseParts = (gameState: TutorialFacts): boolean => {
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
const hasBirdhouseWood = (gameState: TutorialFacts): boolean =>
  countOf(gameState, isPallet) > 0 ||
  countOf(gameState, isFullPalletBoard) >= BIRDHOUSE_BOARDS_NEEDED ||
  hasBirdhouseParts(gameState) ||
  hasBirdhouse(gameState);

const isHandSawItem = (material: MaterialInstance) =>
  material.type === "tool" && material.toolId === "handSaw";

const shoppingCart = (gameState: TutorialFacts) =>
  gameState.player.away?.kind === "shopping"
    ? gameState.player.away.cart
    : null;

const sawInCart = (gameState: TutorialFacts): boolean =>
  (shoppingCart(gameState) ?? []).some(
    (line) => line.kind === "material" && isHandSawItem(line.material),
  );

const hasSaw = (gameState: TutorialFacts) => ownsTool(gameState, "handSaw");

const sawMounted = (gameState: TutorialFacts) =>
  gameState.machines.some((machine) => machine.tools.includes("handSaw"));

/** The savings goal that ends the opening. */
export const TUTORIAL_MONEY_GOAL = 300;

const reachedMoneyGoal = (gameState: TutorialFacts) =>
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
const OPENING_GOALS: ReadonlyArray<TutorialGoal> = [
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
        // Satisfied by exactly what the label says: the shelf is out on
        // the stand. Transient (it can be taken back), but the walk
        // ratchets past it the tick it first holds; the sale keeps it
        // satisfied in a shop reloaded after the shelf sold.
        id: "sellShelf",
        label: "Set it out at the stand",
        targets: [{ kind: "stand" }],
        satisfied: (gameState) =>
          gameState.stand.some(isRusticShelf) || soldFirstPiece(gameState),
      },
    ],
  },
  {
    id: "birdhouse",
    title: "Build a birdhouse",
    steps: [
      {
        // The sale gate, worn honestly as its own box: the rest of this
        // goal starts at the store, and the store is what the first sale
        // unlocks — so the list holds here until the money exists to
        // spend. The wait is short: while the first sale is pending the
        // clock runs at working pace (see timeSpeed in time-flow.ts), so
        // the dealt buyer's stroll to the stand passes in seconds.
        id: "firstSale",
        label: "Wait for your first sale",
        targets: [{ kind: "stand" }],
        satisfied: soldFirstPiece,
      },
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
        // The shelves only load a cart you're pushing, so the corral by
        // the entrance is the first stop of every shopping run.
        id: "grabCart",
        label: "Grab a cart by the entrance",
        targets: [{ kind: "dom", id: "store-corral" }],
        satisfied: (gameState) =>
          (gameState.player.away?.kind === "shopping" &&
            gameState.player.away.hasCart) ||
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

/**
 * The sweeping lesson. Its steps are the broom loop end to end: the pan
 * holding dust proves a sweep happened, and the pan coming back up empty
 * proves it was poured out at the can — the only drain it has. Transient
 * conditions are fine here because the walk ratchets: the frontier moves
 * the tick a predicate first holds and never comes back.
 */
const DUST_GOALS: ReadonlyArray<TutorialGoal> = [
  {
    id: "sweepFloor",
    title: "Sweep the floor",
    steps: [
      {
        id: "getBroom",
        label: "Buy a broom at the Orange Box",
        targets: [
          { kind: "truck", part: "cab" },
          { kind: "dom", id: "store-tool-broom" },
        ],
        satisfied: (gameState) => gameState.broomOwned,
      },
      {
        id: "sweepUp",
        label: "Sweep dust into the pan",
        targets: [{ kind: "broom" }],
        satisfied: (gameState) => dustTotal(gameState.dustpan) > 0,
      },
      {
        id: "emptyPan",
        label: "Empty the pan at the garbage can",
        targets: [{ kind: "machine", machineTypeId: "garbageCan" }],
        satisfied: (gameState) => dustTotal(gameState.dustpan) === 0,
      },
    ],
  },
];

/** One to-do card: when it goes up, and the goals written on it. */
export interface TutorialTrack {
  readonly id: TutorialTrackId;
  /** Whether the card has gone up yet. Reads a one-way condition, so a
   * begun track never un-begins. */
  readonly begun: (gameState: TutorialFacts) => boolean;
  readonly goals: ReadonlyArray<TutorialGoal>;
}

/** Every track, in the order their cards stack on the wall. */
export const TUTORIAL_TRACKS: ReadonlyArray<TutorialTrack> = [
  { id: "opening", begun: () => true, goals: OPENING_GOALS },
  {
    id: "dust",
    begun: (gameState) => gameState.progression.sweepingUnlocked,
    goals: DUST_GOALS,
  },
];

/** Each track's goals flattened to the walk order its stored index counts in. */
const STEPS_BY_TRACK: Readonly<
  Record<TutorialTrackId, ReadonlyArray<TutorialStep>>
> = {
  opening: OPENING_GOALS.flatMap((goal) => goal.steps),
  dust: DUST_GOALS.flatMap((goal) => goal.steps),
};

/**
 * Walk every track's step index past everything the shop already
 * satisfies. Called from the milestone pass, which runs every tick, so
 * the cards keep up with whatever the player did without any action
 * needing to know the tutorials exist. Returns the incoming record
 * untouched when nothing moved, so the pass can compare by identity.
 *
 * Tracks walk whether or not their card is up yet: a player who buys a
 * broom and sweeps before the floor ever gets bad has already taken the
 * lesson, and the card skips what they've shown they know.
 */
export function advanceTutorials(
  gameState: TutorialFacts,
): Readonly<Record<TutorialTrackId, TutorialTrackProgress>> {
  let tutorials = gameState.progression.tutorials;
  for (const track of TUTORIAL_TRACKS) {
    const progress = tutorials[track.id];
    const steps = STEPS_BY_TRACK[track.id];
    let step = progress.step;
    while (step < steps.length && steps[step].satisfied(gameState)) {
      step++;
    }
    if (step !== progress.step) {
      tutorials = { ...tutorials, [track.id]: { ...progress, step } };
    }
  }
  return tutorials;
}

/** The step a track's coach is on, or null while its card isn't up —
 * not begun yet, skipped, or every box ticked. */
export function currentTutorialStep(
  gameState: TutorialFacts,
  trackId: TutorialTrackId,
): TutorialStep | null {
  const track = TUTORIAL_TRACKS.find((t) => t.id === trackId);
  const progress = gameState.progression.tutorials[trackId];
  if (track === undefined || progress.dismissed || !track.begun(gameState)) {
    return null;
  }
  return STEPS_BY_TRACK[trackId][progress.step] ?? null;
}

/** A to-do card's view of its current goal: its steps and which boxes
 * are checked right now. */
export interface TutorialGoalView {
  readonly trackId: TutorialTrackId;
  readonly goal: TutorialGoal;
  /** Aligned with goal.steps: passed by the walk, or satisfied live. */
  readonly checked: ReadonlyArray<boolean>;
}

/**
 * The goal holding a track's current step, with each box's checked state.
 * A box is checked once the walk has passed it — the walk only moves
 * forward, so a condition that has come and gone (the pallet that got
 * pried, the pan that got poured out) stays checked — or while its
 * predicate holds, so work done ahead of the coach shows up immediately.
 */
export function currentTutorialGoalView(
  gameState: TutorialFacts,
  trackId: TutorialTrackId,
): TutorialGoalView | null {
  const step = currentTutorialStep(gameState, trackId);
  if (step === null) return null;
  const track = TUTORIAL_TRACKS.find((t) => t.id === trackId);
  const goal = track?.goals.find((g) => g.steps.includes(step));
  if (goal === undefined) return null;
  const steps = STEPS_BY_TRACK[trackId];
  const walkFrontier = gameState.progression.tutorials[trackId].step;
  return {
    trackId,
    goal,
    checked: goal.steps.map(
      (s) => steps.indexOf(s) < walkFrontier || s.satisfied(gameState),
    ),
  };
}

/** Every card on the wall right now, in track order — the opening on
 * top, lessons that begin later beneath it. */
export function tutorialViews(
  gameState: TutorialFacts,
): ReadonlyArray<TutorialGoalView> {
  return TUTORIAL_TRACKS.flatMap((track) => {
    const view = currentTutorialGoalView(gameState, track.id);
    return view === null ? [] : [view];
  });
}

/** The current step of every up card — everything the coach is pointing
 * at, across all tracks. */
export function activeTutorialSteps(
  gameState: TutorialFacts,
): ReadonlyArray<TutorialStep> {
  return TUTORIAL_TRACKS.flatMap((track) => {
    const step = currentTutorialStep(gameState, track.id);
    return step === null ? [] : [step];
  });
}
