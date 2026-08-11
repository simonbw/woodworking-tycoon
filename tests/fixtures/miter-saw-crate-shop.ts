import { NO_CONSUMABLES } from "../../src/game/Consumable";
import { GameState } from "../../src/game/GameState";
import { ALL_ARTICLE_IDS } from "../../src/game/manual";
import { STARTER_SKILLS } from "../../src/game/Skill";

/** A miter saw delivery waiting crated at the entrance, carrying unlocked. */
export const miterSawCrateShop: GameState = {
  tick: 0,
  day: 1,
  dayStartTick: 0,
  money: 50,
  reputation: 2,
  consumables: NO_CONSUMABLES,
  clamps: 0,
  materialPiles: [],
  player: {
    name: "Player",
    position: [0, 0],
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
      inputMaterials: [],
      processingMaterials: [],
      outputMaterials: [],
      tools: [],
      selectedOperationId: "rip",
      selectedParameters: { width: 8 },
      operationProgress: {
        status: "notStarted",
        phaseIndex: 0,
        ticksRemaining: 0,
      },
    },
  ],
  truck: { bed: [], crates: [] },
  machineCrates: [
    {
      machine: {
        machineTypeId: "miterSaw",
        position: [0, 0],
        rotation: 0,
        inputMaterials: [],
        processingMaterials: [],
        outputMaterials: [],
        tools: [],
        storedMaterials: [],
        upgrades: [],
        selectedOperationId: "cutBoard",
        operationProgress: {
          status: "notStarted",
          phaseIndex: 0,
          ticksRemaining: 0,
        },
      },
      position: [6, 8],
    },
  ],
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
    salesCompleted: 1,
    sweepingUnlocked: false,
    dustTipDismissed: false,
    unlockedArticles: ALL_ARTICLE_IDS,
    readArticles: ALL_ARTICLE_IDS,
    xp: 0,
    skillPoints: 0,
    unlockedSkills: STARTER_SKILLS,
  },
  stand: [],
  customers: [],
  dust: {},
  shopVac: null,
  broomOwned: true,
  broomPosition: [0, 0],
  dustpan: {},
};
