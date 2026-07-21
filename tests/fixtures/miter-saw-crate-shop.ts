import { NO_CONSUMABLES } from "../../src/game/Consumable";
import { GameState } from "../../src/game/GameState";
import { STARTER_SKILLS } from "../../src/game/Skill";

/** A miter saw delivery waiting crated at the entrance, carrying unlocked. */
export const miterSawCrateShop: GameState = {
  tick: 0,
  money: 50,
  reputation: 2,
  consumables: NO_CONSUMABLES,
  materialPiles: [],
  player: {
    name: "Player",
    position: [0, 0],
    direction: 0,
    inventory: [],
    workQueue: [],
    canWork: true,
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
      position: [2, 5],
    },
  ],
  storage: {
    tools: [],
    upgrades: [],
  },
  shopInfo: {
    name: "One Car Garage",
    electricity: 120,
    size: [4, 6],
    materialDropoffPosition: [3, 5],
    entrancePosition: [2, 5],
  },
  progression: {
    tutorialStage: 2,
    storeUnlocked: true,
    shopLayoutUnlocked: true,
    marketplaceUnlocked: false,
    commissionsCompleted: 1,
    tickSpeedControlsUnlocked: false,
    sweepingUnlocked: false,
    dustTipDismissed: false,
    xp: 0,
    skillPoints: 0,
    unlockedSkills: STARTER_SKILLS,
  },
  listings: [],
  jobBoard: [],
  acceptedJobs: [],
  categoryDemand: {},
  dust: {},
  shopVac: null,
};
