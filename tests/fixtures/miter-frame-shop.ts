import { NO_CONSUMABLES } from "../../src/game/Consumable";
import { GameState } from "../../src/game/GameState";
import { ALL_ARTICLE_IDS } from "../../src/game/manual";
import { Board, BoardDimension } from "../../src/game/Materials";
import { MachineState } from "../../src/game/Machine";
import { STARTER_SKILLS } from "../../src/game/Skill";

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

/** Sanded S4S walnut frame stock, 1" wide and 1/4 thick. */
function frameStock(id: string, length: BoardDimension): Board {
  return {
    id,
    type: "board",
    species: "walnut",
    length,
    width: 1,
    thickness: 1,
    surface: "sanded",
    jointedFaces: 2,
    jointedEdges: 2,
  };
}

/** A finished rail: mirrored 45° miters — the ends lean toward each other. */
function rail(id: string): Board {
  return {
    ...frameStock(id, 2),
    ends: {
      left: { kind: "mitered", angle: -45 },
      right: { kind: "mitered", angle: 45 },
    },
  };
}

/**
 * The picture frame chain, ready to run: a miter saw (op cell [1,2], where
 * the player starts) and a workspace ([3,2]). One long stick of walnut
 * frame stock to cut the last rail from, three rails already mitered,
 * nails in the drawer, and the miteredFrames skill unlocked.
 */
export const miterFrameShop: GameState = {
  tick: 0,
  money: 1000,
  reputation: 10,
  consumables: { ...NO_CONSUMABLES, nails: 10 },
  materialPiles: [],
  player: {
    name: "Player",
    position: [1, 2], // the miter saw's operation cell
    direction: 0,
    inventory: [
      frameStock("test-stock-1", 8),
      rail("test-rail-1"),
      rail("test-rail-2"),
      rail("test-rail-3"),
    ],
    workQueue: [],
    canWork: true,
    busyTicks: 0,
    away: null,
  },
  machines: [
    idleMachine("miterSaw", [1, 1], "cutBoard", {
      angle: 0,
      cutPosition: 4,
    }),
    idleMachine("workspace", [3, 1], "buildPictureFrame"),
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
    commissionsCompleted: 7,
    tickSpeedControlsUnlocked: true,
    sweepingUnlocked: false,
    dustTipDismissed: false,
    unlockedArticles: ALL_ARTICLE_IDS,
    readArticles: ALL_ARTICLE_IDS,
    xp: 0,
    skillPoints: 0,
    unlockedSkills: [...STARTER_SKILLS, "miteredFrames"],
  },
  listings: [],
  jobBoard: [],
  acceptedJobs: [],
  categoryDemand: {},
  dust: {},
  shopVac: null,
};
