import { GameState } from "../../src/game/GameState";

/**
 * Free selling unlocked, a sales table placed, and the player standing at its
 * operation position with sellable items in inventory.
 */
export const freeSellingShop: GameState = {
  tick: 0,
  money: 100,
  reputation: 5,
  materialPiles: [],
  player: {
    name: "Player",
    position: [1, 3], // the sales table's operation cell
    direction: 0,
    inventory: [
      {
        id: "test-shelf-1",
        type: "rusticShelf",
        species: "pallet",
      },
      {
        id: "test-board-1",
        type: "board",
        species: "pallet",
        width: 4,
        length: 3,
        thickness: 1,
        surface: "rough",
      },
    ],
    workQueue: [],
    canWork: true,
    away: null,
  },
  machines: [
    {
      machineTypeId: "salesTable",
      position: [1, 2],
      rotation: 0,
      inputMaterials: [],
      processingMaterials: [],
      outputMaterials: [],
      tools: [],
      selectedOperationId: "none",
      operationProgress: {
        status: "notStarted",
        ticksRemaining: 0,
      },
    },
  ],
  storage: {
    machines: [],
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
    freeSelling: true,
    commissionsCompleted: 2,
    tickSpeedControlsUnlocked: false,
  },
};
