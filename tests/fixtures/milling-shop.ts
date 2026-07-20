import { NO_CONSUMABLES } from "../../src/game/Consumable";
import { GameState } from "../../src/game/GameState";
import { Board } from "../../src/game/Materials";
import { MachineState } from "../../src/game/Machine";
import { STARTER_SKILLS } from "../../src/game/Skill";

function idleMachine(
  machineTypeId: MachineState["machineTypeId"],
  position: [number, number],
  selectedOperationId: string,
  selectedParameters?: MachineState["selectedParameters"],
  tools: MachineState["tools"] = [],
): MachineState {
  return {
    machineTypeId,
    position,
    rotation: 0,
    inputMaterials: [],
    processingMaterials: [],
    outputMaterials: [],
    tools,
    selectedOperationId,
    selectedParameters,
    operationProgress: {
      status: "notStarted",
      phaseIndex: 0,
      ticksRemaining: 0,
    },
  };
}

/** A board straight off the rough rack: nothing flat, nothing straight. */
function roughWalnut(id: string): Board {
  return {
    id,
    type: "board",
    species: "walnut",
    length: 8,
    width: 6,
    thickness: 4,
    surface: "rough",
    jointedFaces: 0,
    jointedEdges: 0,
  };
}

/**
 * The full milling chain, ready to run: jointer (op cell [1,2], where the
 * player starts), planer (op cell [3,2]), table saw with the straight-line
 * sled mounted (op cell [1,5]), and a workspace ([3,5]). Two rough walnut
 * boards in the player's pockets, 22 reputation so every lumber channel is
 * open in the store, and jigsAndFixtures unlocked so the sled operates.
 */
export const millingShop: GameState = {
  tick: 0,
  money: 1000,
  reputation: 22,
  consumables: NO_CONSUMABLES,
  materialPiles: [],
  player: {
    name: "Player",
    position: [1, 2], // the jointer's operation cell
    direction: 0,
    inventory: [roughWalnut("test-rough-1"), roughWalnut("test-rough-2")],
    workQueue: [],
    canWork: true,
    busyTicks: 0,
    away: null,
  },
  machines: [
    idleMachine("jointer", [1, 1], "jointFace"),
    idleMachine("lunchboxPlaner", [3, 1], "planeBoard", {
      targetThickness: 4,
    }),
    idleMachine("jobsiteTableSaw", [1, 4], "ripBoard", { targetWidth: 4 }, [
      "straightLineSled",
    ]),
    idleMachine("workspace", [3, 4], "glueUpPanel"),
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
    marketplaceUnlocked: true,
    commissionsCompleted: 7,
    tickSpeedControlsUnlocked: true,
    sweepingUnlocked: false,
    dustTipDismissed: false,
    xp: 0,
    skillPoints: 0,
    unlockedSkills: [...STARTER_SKILLS, "jigsAndFixtures"],
  },
  listings: [],
  jobBoard: [],
  acceptedJobs: [],
  categoryDemand: {},
  dust: {},
  shopVac: null,
};
