import { GameState } from "../../src/game/GameState";

export const layoutWithPlacedMachines: GameState = {
  tick: 0,
  money: 50,
  reputation: 2,
  materialPiles: [
    {
      material: {
        id: "test-board-1",
        type: "board",
        species: "oak",
        width: 8,
        length: 8,
        thickness: 1,
      },
      position: [2, 1],
    },
  ],
  player: {
    name: "Player",
    position: [0, 0],
    direction: 0,
    inventory: [],
    workQueue: [],
    canWork: true,
  },
  machines: [
    {
      machineTypeId: "workspace",
      position: [1, 2],
      rotation: 0,
      inputMaterials: [],
      processingMaterials: [],
      outputMaterials: [],
      selectedOperationId: "rip",
      selectedParameters: { width: 8 },
      operationProgress: {
        status: "notStarted",
        ticksRemaining: 0,
      },
    },
    {
      machineTypeId: "miterSaw",
      position: [2, 4],
      rotation: 0,
      inputMaterials: [
        {
          id: "test-board-2",
          type: "board",
          species: "oak",
          width: 8,
          length: 8,
          thickness: 1,
        },
      ],
      processingMaterials: [],
      outputMaterials: [],
      selectedOperationId: "cutBoard",
      selectedParameters: { targetLength: 8 },
      operationProgress: {
        status: "notStarted",
        ticksRemaining: 0,
      },
    },
    {
      machineTypeId: "makeshiftBench",
      position: [0, 4],
      rotation: 0,
      inputMaterials: [],
      processingMaterials: [],
      outputMaterials: [],
      selectedOperationId: "assemble",
      operationProgress: {
        status: "notStarted",
        ticksRemaining: 0,
      },
    },
  ],
  storage: {
    machines: [],
  },
  commissions: [],
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
  },
};
