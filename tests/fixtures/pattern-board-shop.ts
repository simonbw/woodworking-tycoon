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
      ticksRemaining: 0,
    },
  };
}

function strip(
  id: string,
  species: Board["species"],
  width: Board["width"],
): Board {
  return {
    id,
    type: "board",
    species,
    length: 2,
    width,
    thickness: 4,
    surface: "smooth",
  };
}

/** A sanded walnut/maple panel in strict alternation, ready to finish. */
const stripedBlank: Panel = {
  id: "test-striped-blank",
  type: "panel",
  length: 2,
  thickness: 4,
  surface: "sanded",
  strips: [
    { species: "walnut", width: 2 },
    { species: "maple", width: 2 },
    { species: "walnut", width: 2 },
    { species: "maple", width: 2 },
    { species: "walnut", width: 2 },
  ],
};

/**
 * Everything needed to walk the pattern-board tiers: workspace with a random
 * orbit sander already mounted, sales table, two-tone boards already known,
 * 3 skill points to spend, a sanded striped blank ready to finish, and the
 * six graduated strips (walnut 3-2-1, maple 1-2-3) for a sunrise glue-up.
 */
export const patternBoardShop: GameState = {
  tick: 0,
  money: 100,
  reputation: 20,
  materialPiles: [],
  player: {
    name: "Player",
    position: [1, 3], // the workspace's operation cell
    direction: 0,
    inventory: [
      stripedBlank,
      strip("test-sunrise-w3", "walnut", 3),
      strip("test-sunrise-m1", "maple", 1),
      strip("test-sunrise-w2", "walnut", 2),
      strip("test-sunrise-m2", "maple", 2),
      strip("test-sunrise-w1", "walnut", 1),
      strip("test-sunrise-m3", "maple", 3),
    ],
    workQueue: [],
    canWork: true,
    away: null,
  },
  machines: [
    idleMachine("workspace", [1, 2], "dismantlePallet", ["randomOrbitSander"]),
    idleMachine("salesTable", [3, 2], "none"),
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
    commissionsCompleted: 5,
    tickSpeedControlsUnlocked: false,
    xp: 0,
    skillPoints: 3,
    unlockedSkills: [...STARTER_SKILLS, "twoToneBoards"],
  },
};
