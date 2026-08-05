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
  day: 1,
  dayStartTick: 0,
  jobBoardDay: 0,
  money: 100,
  reputation: 5,
  consumables: NO_CONSUMABLES,
  clamps: 0,
  materialPiles: [],
  player: {
    name: "Player",
    position: [0, 0],
    direction: 0,
    inventory: [
      // Two identical shelves: they collapse into one priced row on the
      // phone and go up as a single stacked offer.
      {
        id: "test-shelf-1",
        type: "rusticShelf",
        species: "pallet",
      },
      {
        id: "test-shelf-2",
        type: "rusticShelf",
        species: "pallet",
      },
      {
        id: "test-board-1",
        type: "board",
        species: "pallet",
        width: 4,
        length: 36,
        thickness: 2,
        surface: "rough",
        jointedFaces: 1,
        jointedEdges: 2,
      },
    ],
    busyTicks: 0,
    away: null,
  },
  machines: [],
  machineCrates: [],
  truck: { bed: [], crates: [] },
  storage: {
    upgrades: [],
  },
  shopInfo: {
    name: "One Car Garage",
    electricity: 120,
    size: [12, 16],
    materialDropoffPosition: [10, 13],
    entrancePosition: [6, 15],
  },
  progression: {
    tutorialStep: 0,
    tutorialDismissed: true,
    storeUnlocked: true,
    lumberyardUnlocked: false,
    marketplaceUnlocked: true,
    commissionsCompleted: 2,
    commissionsOffered: 2,
    commissionArrivalSeen: true,
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
  seenJobTemplateIds: [],
  acceptedJobs: [],
  categoryDemand: {},
  dust: {},
  shopVac: null,
  broomOwned: true,
  broomPosition: [0, 0],
  dustpan: {},
};
