import { NO_CONSUMABLES } from "../../src/game/Consumable";
import { GameState } from "../../src/game/GameState";
import { STARTER_SKILLS } from "../../src/game/Skill";

/**
 * Marketplace unlocked, with sellable items in the player's inventory —
 * ready to exercise listing, sale rolls, the job board, and scavenging.
 */
export const marketplaceShop: GameState = {
  tick: 0,
  money: 100,
  reputation: 5,
  consumables: NO_CONSUMABLES,
  materialPiles: [],
  player: {
    name: "Player",
    position: [0, 0],
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
        jointedFaces: 1,
        jointedEdges: 2,
      },
    ],
    workQueue: [],
    canWork: true,
    busyTicks: 0,
    away: null,
  },
  machines: [],
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
    commissionsCompleted: 2,
    tickSpeedControlsUnlocked: false,
    sweepingUnlocked: false,
    dustTipDismissed: false,
    xp: 0,
    skillPoints: 0,
    unlockedSkills: STARTER_SKILLS,
  },
  listings: [],
  jobBoard: [],
  acceptedJobs: [],
  categoryDemand: {},
  dust: {},
};
