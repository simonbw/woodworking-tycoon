import { GameState } from "../../src/game/GameState";

export const layoutWithMiterSawInStorage: GameState = {
  tick: 0,
  money: 50,
  reputation: 2,
  materialPiles: [],
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
        ticksRemaining: 0,
      },
    },
  ],
  storage: {
    machines: ["miterSaw"],
    tools: [],
  },
  shopInfo: {
    name: "One Car Garage",
    electricity: 120,
    size: [4, 6],
    materialDropoffPosition: [3, 5],
  },
  progression: {
    tutorialStage: 2,
    storeUnlocked: true,
    shopLayoutUnlocked: true,
    freeSelling: false,
    commissionsCompleted: 1,
    tickSpeedControlsUnlocked: false,
  },
};
