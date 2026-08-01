import { NO_CONSUMABLES } from "../../src/game/Consumable";
import { GameState } from "../../src/game/GameState";
import { ALL_ARTICLE_IDS } from "../../src/game/manual";
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
 * The full milling chain, ready to run: jointer (op cell [2,10]), planer
 * (op cell [4,10]), table saw with the straight-line sled mounted (op cell
 * [8,10]), and a workspace (op cell [10,4]). The feed-through machines sit
 * mid-shop in their own columns, each with the 6–7' of lane an 8' board
 * needs both sides (see feed-clearance.ts). Two rough walnut boards in the
 * player's pockets, 48 reputation so every lumber channel is open in the
 * store, and jigsAndFixtures unlocked so the sled operates.
 *
 * The player starts a step back from the jointer's infeed, facing it,
 * rather than on the operation cell itself: the jointer's beds overhang
 * its footprint by a couple of inches (see the measured collision box),
 * so a body dropped at that cell's *center* lands inside the outfeed
 * table — deeper than it could ever walk. One cell back is clear floor.
 */
export const millingShop: GameState = {
  tick: 0,
  money: 1000,
  reputation: 48,
  consumables: NO_CONSUMABLES,
  clamps: 4,
  materialPiles: [],
  player: {
    name: "Player",
    position: [2, 11], // one step down the jointer's infeed lane
    direction: 1, // facing the jointer
    inventory: [roughWalnut("test-rough-1"), roughWalnut("test-rough-2")],
    busyTicks: 0,
    away: null,
  },
  machines: [
    idleMachine("jointer", [2, 8], "jointFace"),
    idleMachine("lunchboxPlaner", [4, 8], "plane", {
      targetThickness: 4,
    }),
    idleMachine("jobsiteTableSaw", [8, 8], "ripBoard", { targetWidth: 4 }, [
      "straightLineSled",
    ]),
    idleMachine("workspace", [10, 2], "glueUpPanel"),
    // In the same corner the starter shop keeps it — the cleaning chain
    // ends at the curb (the jointer's lane runs down column 2, clear of it)
    idleMachine("garbageCan", [0, 13], "empty"),
  ],
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
    tutorialStage: 2,
    storeUnlocked: true,
    lumberyardUnlocked: true,
    marketplaceUnlocked: true,
    commissionsCompleted: 5,
    commissionsOffered: 5,
    commissionArrivalSeen: true,
    sweepingUnlocked: false,
    dustTipDismissed: false,
    unlockedArticles: ALL_ARTICLE_IDS,
    readArticles: ALL_ARTICLE_IDS,
    xp: 0,
    skillPoints: 0,
    unlockedSkills: [...STARTER_SKILLS, "jigsAndFixtures"],
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
