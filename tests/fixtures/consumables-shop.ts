import { NO_CONSUMABLES } from "../../src/game/Consumable";
import { GameState } from "../../src/game/GameState";
import { initialPalletNails } from "../../src/game/bench-work/pallet-geometry";
import { ALL_ARTICLE_IDS } from "../../src/game/manual";
import { STARTER_SKILLS } from "../../src/game/Skill";

/**
 * A shop staged for the consumables loop: the starter workspace (hammer
 * mounted) already loaded with a part-stripped pallet, an unfinished maple
 * cutting board in the player's pocket, and an empty supply shelf. Five
 * deck boards remain on three stringers, so a full dismantle yields 8
 * boards and 15 nails — a rustic shelf's eight with change to spare.
 */
export const consumablesShop: GameState = {
  tick: 0,
  day: 1,
  dayStartTick: 0,
  jobBoardDay: 0,
  money: 20,
  reputation: 0,
  materialPiles: [],
  consumables: NO_CONSUMABLES,
  clamps: 0,
  player: {
    name: "Player",
    position: [1, 4], // the workspace's operation cell
    direction: 0,
    inventory: [
      {
        id: "fx-raw-board",
        type: "simpleCuttingBoard",
        species: "maple",
      },
    ],
    busyTicks: 0,
    away: null,
  },
  machines: [
    {
      machineTypeId: "workspace",
      position: [1, 2],
      rotation: 0,
      inputMaterials: [
        {
          id: "fx-pallet",
          type: "pallet",
          deckBoards: [true, true, true, true, true, false, false, false],
          stringers: [true, true, true],
          nails: initialPalletNails(
            [true, true, true, true, true],
            [true, true, true],
          ),
        },
      ],
      processingMaterials: [],
      outputMaterials: [],
      tools: ["hammer", "finishingKit"],
      selectedOperationId: "dismantlePallet",
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
  broomOwned: true,
  broomPosition: [0, 0],
  dustpan: {},
};
