import { NO_CONSUMABLES } from "./Consumable";
import { GameState } from "./GameState";
import { STARTING_ARTICLES } from "./manual";
import { STARTER_SKILLS } from "./Skill";
import { ToolId } from "./Tool";
import {
  MACHINE_TYPES,
  MachineId,
  MachineState,
  ParameterValues,
} from "./Machine";
import { Direction } from "./Vectors";
import { defaultEntrancePosition } from "./ShopInfo";
import { makePallet } from "./material-helpers";
import { isParameterizedOperation } from "./operation-helpers";

export const initialGameState: GameState = {
  tick: 0,
  money: 0,
  reputation: 0,
  materialPiles: [
    {
      material: makePallet(),
      position: [2, 5], // Positioned for easy access to workspace
    },
  ],
  // No starter kit: supplies come from the store, or back out of salvage
  // (prying a pallet apart recovers its nails)
  consumables: NO_CONSUMABLES,
  player: {
    name: "Player",
    position: [6, 12],
    direction: 1,
    inventory: [],
    workQueue: [],
    canWork: true,
    busyTicks: 0,
    away: null,
  },
  machines: [
    // Single workspace for tutorial, with the starter hammer mounted
    // (3×2 ft, against the back wall with its front apron open)
    machine("workspace", [2, 2], 0, ["hammer"]),
    // Garbage can for disposing unwanted materials (2×2 ft, in a corner)
    machine("garbageCan", [0, 13], 0),
  ],
  machineCrates: [],
  storage: {
    tools: [],
    upgrades: [],
  },
  shopInfo: {
    name: "One Car Garage",
    electricity: 120,
    // 12' × 16', in 1-ft cells
    size: [12, 16],
    materialDropoffPosition: [10, 13],
    entrancePosition: defaultEntrancePosition([12, 16]),
  },
  progression: {
    tutorialStage: 0,
    storeUnlocked: false,
    lumberyardUnlocked: false,
    shopLayoutUnlocked: false,
    marketplaceUnlocked: false,
    commissionsCompleted: 0,
    tickSpeedControlsUnlocked: false,
    sweepingUnlocked: false,
    dustTipDismissed: false,
    // Welcome starts unread on purpose: the manual auto-opens to it once.
    unlockedArticles: STARTING_ARTICLES,
    readArticles: [],
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
  pendingSounds: [],
};

// Helper method to create a machine with less boilerplate
function machine(
  machineTypeId: MachineId,
  position: [number, number],
  rotation: Direction,
  tools: ReadonlyArray<ToolId> = [],
): MachineState {
  const machineType = MACHINE_TYPES[machineTypeId];
  const firstOperation = machineType.operations[0];
  let selectedParameters: ParameterValues | undefined;

  // If the first operation is parameterized, set default parameter values
  if (isParameterizedOperation(firstOperation)) {
    selectedParameters = {};
    for (const param of firstOperation.parameters) {
      selectedParameters[param.id] = param.values[0];
    }
  }

  return {
    machineTypeId,
    position,
    rotation,
    inputMaterials: [],
    processingMaterials: [],
    outputMaterials: [],
    tools,
    storedMaterials: [],
    selectedOperationId: firstOperation.id,
    selectedParameters,
    operationProgress: {
      status: "notStarted",
      phaseIndex: 0,
      ticksRemaining: 0,
    },
  };
}
