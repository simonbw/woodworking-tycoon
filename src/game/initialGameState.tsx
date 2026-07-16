import { GameState } from "./GameState";
import { STARTER_SKILLS } from "./Skill";
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
  player: {
    name: "Player",
    position: [0, 0],
    direction: 0,
    inventory: [],
    workQueue: [],
    canWork: true,
    away: null,
  },
  machines: [
    // Single workspace for tutorial
    machine("workspace", [1, 2], 0),
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
    freeSelling: false,
    commissionsCompleted: 0,
    tickSpeedControlsUnlocked: false,
    xp: 0,
    skillPoints: 0,
    unlockedSkills: STARTER_SKILLS,
  },
  pendingSounds: [],
};

// Helper method to create a machine with less boilerplate
function machine(
  machineTypeId: MachineId,
  position: [number, number],
  rotation: Direction,
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
    tools: [],
    selectedOperationId: firstOperation.id,
    selectedParameters,
    operationProgress: {
      status: "notStarted",
      ticksRemaining: 0,
    },
  };
}
