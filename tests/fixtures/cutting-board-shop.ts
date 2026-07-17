import { NO_CONSUMABLES } from "../../src/game/Consumable";
import { GameState } from "../../src/game/GameState";
import { STARTER_SKILLS } from "../../src/game/Skill";
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
    tools: [],
    selectedOperationId,
    selectedParameters,
    operationProgress: {
      status: "notStarted",
      phaseIndex: 0,
      ticksRemaining: 0,
    },
  };
}

/**
 * Everything needed to run the cutting board chain WITHOUT a planer:
 * workspace and sales table (operation cells at [1,3], [3,3]), the player at
 * the workspace with five smooth maple strips, a random orbit sander in tool
 * storage, and commission 6 active. Proves machines buy time, not access.
 */
export const cuttingBoardShop: GameState = {
  tick: 0,
  money: 100,
  reputation: 17,
  consumables: NO_CONSUMABLES,
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
      surface: "smooth" as const,
    })),
    workQueue: [],
    canWork: true,
    away: null,
  },
  machines: [
    idleMachine("workspace", [1, 2], "dismantlePallet"),
    idleMachine("salesTable", [3, 2], "none"),
  ],
  storage: {
    machines: [],
    tools: ["randomOrbitSander"],
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
    // Lets specs use the speed keys to fast-forward through glue cures
    tickSpeedControlsUnlocked: true,
    xp: 0,
    skillPoints: 0,
    unlockedSkills: STARTER_SKILLS,
  },
};
