import { NO_CONSUMABLES } from "./Consumable";
import { GameState } from "./GameState";
import { STARTER_SKILLS } from "./Skill";
import { ToolId } from "./Tool";
import {
  MACHINE_TYPES,
  MachineId,
  MachineState,
  ParameterValues,
} from "./Machine";
import { Direction } from "./Vectors";
import { makePallet } from "./material-helpers";
import { isParameterizedOperation } from "./operation-helpers";

export const initialGameState: GameState = {
  tick: 0,
  money: 0,
  reputation: 0,
  materialPiles: [
    {
      material: makePallet(),
      position: [2, 4], // Positioned for easy access to workspace
    },
  ],
  // No starter kit: supplies come from the store, or back out of salvage
  // (prying a pallet apart recovers its nails)
  consumables: NO_CONSUMABLES,
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
    // Single workspace for tutorial, with the starter hammer mounted
    machine("workspace", [1, 2], 0, ["hammer"]),
    // Garbage can for disposing unwanted materials
    machine("garbageCan", [0, 5], 0),
  ],
  storage: {
    machines: [], // Empty - no machines available initially
    tools: [],
  },
  shopInfo: {
    name: "One Car Garage",
    electricity: 120,
    size: [4, 6],
    materialDropoffPosition: [3, 5],
  },
  progression: {
    tutorialStage: 0,
    storeUnlocked: false,
    shopLayoutUnlocked: false,
    marketplaceUnlocked: false,
    commissionsCompleted: 0,
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
    selectedOperationId: firstOperation.id,
    selectedParameters,
    operationProgress: {
      status: "notStarted",
      phaseIndex: 0,
      ticksRemaining: 0,
    },
  };
}
