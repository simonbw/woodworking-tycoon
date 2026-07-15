import { GameState } from "../../src/game/GameState";
import { MachineState } from "../../src/game/Machine";

function idleMachine(
  machineTypeId: MachineState["machineTypeId"],
  position: [number, number],
  selectedOperationId: string,
  selectedParameters?: MachineState["selectedParameters"],
): MachineState {
  return {
    machineTypeId,
    position,
    rotation: 0,
    inputMaterials: [],
    processingMaterials: [],
    outputMaterials: [],
    selectedOperationId,
    selectedParameters,
    operationProgress: {
      status: "notStarted",
      ticksRemaining: 0,
    },
  };
}

/**
 * Everything needed to run the cutting board chain: workspace, planer, and
 * sales table in a row (operation cells at [1,3], [2,3], [3,3]), the player
 * at the workspace with five maple strips, and commission 6 active.
 */
export const cuttingBoardShop: GameState = {
  tick: 0,
  money: 100,
  reputation: 17,
  materialPiles: [],
  player: {
    name: "Player",
    position: [1, 3], // the workspace's operation cell
    direction: 0,
    inventory: Array.from({ length: 5 }, (_, i) => ({
      id: `test-strip-${i}`,
      type: "board" as const,
      species: "maple" as const,
      length: 2 as const,
      width: 2 as const,
      thickness: 4 as const,
    })),
    workQueue: [],
    canWork: true,
    away: null,
  },
  machines: [
    idleMachine("workspace", [1, 2], "dismantlePallet"),
    idleMachine("lunchboxPlaner", [2, 2], "planeBoard", {
      targetThickness: 1,
    }),
    idleMachine("salesTable", [3, 2], "none"),
  ],
  storage: {
    machines: [],
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
    commissionsCompleted: 5,
    tickSpeedControlsUnlocked: false,
  },
};
