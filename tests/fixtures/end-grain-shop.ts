import { NO_CONSUMABLES } from "../../src/game/Consumable";
import { GameState } from "../../src/game/GameState";
import { STARTER_SKILLS } from "../../src/game/Skill";
import { MachineState } from "../../src/game/Machine";
import { Board, Panel } from "../../src/game/Materials";

function idleMachine(
  machineTypeId: MachineState["machineTypeId"],
  position: [number, number],
  selectedOperationId: string,
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
    selectedParameters: undefined,
    operationProgress: {
      status: "notStarted",
      phaseIndex: 0,
      ticksRemaining: 0,
    },
    // This spec is about the end-grain chain, not the power switch — the
    // saw starts switched on (milling.spec covers the switch itself).
    poweredOn: true,
  };
}

/** A sanded single-species maple panel, ready for the crosscut sled. */
const sandedBlank: Panel = {
  id: "test-eg-blank",
  type: "panel",
  length: 2,
  thickness: 4,
  surface: "sanded",
  strips: Array.from({ length: 5 }, () => ({
    species: "maple" as const,
    width: 2 as const,
  })),
};

function palletBoard(id: string): Board {
  return {
    id,
    type: "board",
    species: "pallet",
    length: 3,
    width: 4,
    thickness: 1,
    surface: "rough",
    jointedFaces: 1,
    jointedEdges: 2,
  };
}

/**
 * Everything for the end-grain chain except the plywood (bought in the
 * store, to cover the Sheet Goods aisle): workspace with sander at [1,2],
 * sales table at [3,2], table saw at [2,4] with a free tool slot, two
 * pallet scraps for sled runners, a sanded maple panel to slice, and 2
 * skill points for Jigs & Fixtures + End-Grain Boards.
 */
export const endGrainShop: GameState = {
  tick: 0,
  money: 100,
  reputation: 20,
  consumables: NO_CONSUMABLES,
  materialPiles: [],
  player: {
    name: "Player",
    position: [1, 3], // the workspace's operation cell
    direction: 0,
    inventory: [
      sandedBlank,
      palletBoard("test-runner-1"),
      palletBoard("test-runner-2"),
    ],
    workQueue: [],
    canWork: true,
    busyTicks: 0,
    away: null,
  },
  machines: [
    idleMachine("workspace", [1, 2], "dismantlePallet", ["randomOrbitSander"]),
    idleMachine("jobsiteTableSaw", [2, 4], "ripBoard"),
  ],
  machineCrates: [],
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
    marketplaceUnlocked: true,
    commissionsCompleted: 5,
    // Lets specs use the speed keys to fast-forward through glue cures
    tickSpeedControlsUnlocked: true,
    sweepingUnlocked: false,
    dustTipDismissed: false,
    xp: 0,
    skillPoints: 2,
    unlockedSkills: STARTER_SKILLS,
  },
  listings: [],
  jobBoard: [],
  acceptedJobs: [],
  categoryDemand: {},
  dust: {},
  shopVac: null,
};
