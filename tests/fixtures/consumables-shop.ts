import { NO_CONSUMABLES } from "../../src/game/Consumable";
import { GameState } from "../../src/game/GameState";
import { STARTER_SKILLS } from "../../src/game/Skill";

/**
 * A shop staged for the consumables loop: the starter workspace (hammer
 * mounted) already loaded with a part-stripped pallet, an unfinished maple
 * cutting board in the player's pocket, and an empty supply shelf. Five
 * deck boards remain, so a full dismantle yields 8 boards and 8 nails —
 * exactly one rustic shelf's worth.
 */
export const consumablesShop: GameState = {
  tick: 0,
  money: 20,
  reputation: 0,
  materialPiles: [],
  consumables: NO_CONSUMABLES,
  player: {
    name: "Player",
    position: [1, 3], // the workspace's operation cell
    direction: 0,
    inventory: [
      {
        id: "fx-raw-board",
        type: "simpleCuttingBoard",
        species: "maple",
      },
    ],
    workQueue: [],
    canWork: true,
    away: null,
  },
  machines: [
    {
      machineTypeId: "workspace",
      position: [1, 2],
      rotation: 0,
      inputMaterials: [
        {
          id: "fx-pallet",
          type: "pallet",
          deckBoards: [
            true,
            true,
            true,
            true,
            true,
            false,
            false,
            false,
            false,
            false,
            false,
          ],
          stringerBoardsLeft: 3,
        },
      ],
      processingMaterials: [],
      outputMaterials: [],
      tools: ["hammer"],
      selectedOperationId: "dismantlePallet",
      operationProgress: {
        status: "notStarted",
        phaseIndex: 0,
        ticksRemaining: 0,
      },
    },
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
    commissionsCompleted: 2,
    tickSpeedControlsUnlocked: true,
    xp: 0,
    skillPoints: 0,
    unlockedSkills: STARTER_SKILLS,
  },
  listings: [],
  jobBoard: [],
  acceptedJobs: [],
  categoryDemand: {},
};
