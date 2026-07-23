import { NO_CONSUMABLES } from "../../src/game/Consumable";
import { GameState } from "../../src/game/GameState";
import { ALL_ARTICLE_IDS } from "../../src/game/manual";
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
    lumberyardUnlocked: false,
    shopLayoutUnlocked: true,
    marketplaceUnlocked: true,
    commissionsCompleted: 2,
    tickSpeedControlsUnlocked: false,
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
