import { NO_CONSUMABLES } from "../../src/game/Consumable";
import { ALL_ARTICLE_IDS } from "../../src/game/manual";
import { GameState } from "../../src/game/GameState";
import { Board } from "../../src/game/Materials";
import { STARTER_SKILLS } from "../../src/game/Skill";

function deckBoard(id: string, length: Board["length"]): Board {
  return {
    id,
    type: "board",
    species: "pallet",
    length,
    width: 4,
    thickness: 1,
    surface: "rough",
    jointedFaces: 1,
    jointedEdges: 2,
  };
}

/**
 * A shop staged for the hand-tool chain: a bare workspace (both tool slots
 * free), enough money for the hand saw, the drill, and a box of screws, and
 * five pallet deck boards in the player's pocket — four already crosscut to
 * 2', one still at 3' so the hand saw has a cut to make.
 */
export const handToolsShop: GameState = {
  tick: 0,
  money: 150,
  reputation: 0,
  materialPiles: [],
  consumables: NO_CONSUMABLES,
  player: {
    name: "Player",
    position: [1, 3], // the workspace's operation cell
    direction: 0,
    inventory: [
      deckBoard("fx-long-board", 3),
      deckBoard("fx-slat-1", 2),
      deckBoard("fx-slat-2", 2),
      deckBoard("fx-slat-3", 2),
      deckBoard("fx-slat-4", 2),
    ],
    workQueue: [],
    canWork: true,
    busyTicks: 0,
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
      selectedOperationId: "dismantlePallet",
      operationProgress: {
        status: "notStarted",
        phaseIndex: 0,
        ticksRemaining: 0,
      },
    },
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
    commissionsCompleted: 2,
    tickSpeedControlsUnlocked: true,
    sweepingUnlocked: false,
    dustTipDismissed: false,
    unlockedArticles: ALL_ARTICLE_IDS,
    readArticles: ALL_ARTICLE_IDS,
    xp: 0,
    skillPoints: 0,
    unlockedSkills: STARTER_SKILLS,
  },
  listings: [],
  jobBoard: [],
  acceptedJobs: [],
  categoryDemand: {},
  dust: {},
  shopVac: null,
};
