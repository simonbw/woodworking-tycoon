import { NO_CONSUMABLES } from "../../src/game/Consumable";
import { ALL_ARTICLE_IDS } from "../../src/game/manual";
import { GameState } from "../../src/game/GameState";
import { Board, Pallet } from "../../src/game/Materials";
import { initialPalletNails } from "../../src/game/bench-work/pallet-geometry";
import { STARTER_SKILLS } from "../../src/game/Skill";
import { Tuple } from "../../src/utils/typeUtils";

const roughBoard: Board = {
  id: "fx-bench-board",
  type: "board",
  species: "maple",
  length: 24,
  width: 4,
  thickness: 4,
  surface: "rough",
  jointedFaces: 1,
  jointedEdges: 2,
};

/** A whole pallet, every nail still in it, waiting on the floor. */
export const benchWorkPallet: Pallet = {
  id: "fx-bench-pallet",
  type: "pallet",
  deckBoards: Array(11).fill(true) as Tuple<boolean, 11>,
  stringers: [true, true, true],
  nails: initialPalletNails(Array(11).fill(true), [true, true, true]),
};

/**
 * A shop staged for the bench view: the player already standing at the
 * workbench, a sanding block mounted, a rough board lying on the bench
 * at a pinned spot — one Tab and a tool off the rail away from stroke
 * work. The stale Sand Board selection is deliberate: tool work isn't a
 * plan anymore, and the view must treat the leftover selection as inert.
 * A full pallet waits in a floor pile for the pry half (the spec
 * restages the bench itself). Sanding (surfacePrep) and dismantling
 * (basicMilling) are starter skills, so nothing needs granting.
 */
export const benchWorkShop: GameState = {
  tick: 0,
  day: 1,
  dayStartTick: 0,
  jobBoardDay: 0,
  money: 0,
  reputation: 0,
  materialPiles: [
    { material: benchWorkPallet, position: [4.5, 4.5], rotation: 0 },
  ],
  consumables: NO_CONSUMABLES,
  clamps: 4,
  player: {
    name: "Player",
    position: [1, 4], // standing at the workspace (its operation cell is [1, 3])
    direction: 0,
    inventory: [],
    busyTicks: 0,
    away: null,
  },
  machines: [
    {
      machineTypeId: "workspace",
      position: [1, 2],
      rotation: 0,
      inputMaterials: [roughBoard],
      processingMaterials: [],
      outputMaterials: [],
      tools: ["sandingBlock"],
      selectedOperationId: "blockSandBoard",
      // Pinned so the spec can aim its strokes: flat, centered, length
      // running down the bench — local inches match bench inches + (10,0)
      benchLayout: {
        "fx-bench-board": { xIn: 12, yIn: 12, angleDeg: 0, flipped: false },
      },
      operationProgress: {
        status: "notStarted",
        phaseIndex: 0,
        ticksRemaining: 0,
      },
    },
  ],
  machineCrates: [],
  truck: { bed: [], crates: [] },
  storage: {
    upgrades: [],
  },
  shopInfo: {
    name: "One Car Garage",
    electricity: 120,
    size: [12, 16],
    materialDropoffPosition: [10, 13],
    entrancePosition: [6, 15],
  },
  progression: {
    tutorialStep: 0,
    tutorialDismissed: true,
    storeUnlocked: true,
    lumberyardUnlocked: false,
    marketplaceUnlocked: true,
    commissionsCompleted: 2,
    commissionsOffered: 2,
    commissionArrivalSeen: true,
    sweepingUnlocked: false,
    dustTipDismissed: false,
    unlockedArticles: ALL_ARTICLE_IDS,
    readArticles: ALL_ARTICLE_IDS,
    xp: 0,
    skillPoints: 0,
    unlockedSkills: STARTER_SKILLS,
  },
  listings: [],
  jobBoard: [],
  seenJobTemplateIds: [],
  acceptedJobs: [],
  categoryDemand: {},
  dust: {},
  shopVac: null,
  broomOwned: false,
  broomPosition: null,
  dustpan: {},
};
