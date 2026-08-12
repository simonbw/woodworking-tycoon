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

/** 8/4 walnut, milled flat and straight — a blank asking to be split. */
function walnutBlank(id: string): Board {
  return {
    id,
    type: "board",
    species: "walnut",
    length: 72,
    width: 6,
    thickness: 8,
    surface: "rough",
    jointedFaces: 2,
    jointedEdges: 2,
  };
}

/**
 * A shop set up to resaw both ways: a band saw (op cell [2,9]) and a table
 * saw (op cell [8,9]), with two 8/4 walnut blanks in the player's pockets
 * and the Resawing skill earned.
 */
export const resawShop: GameState = {
  tick: 0,
  day: 1,
  dayStartTick: 0,
  money: 1000,
  reputation: 22,
  consumables: NO_CONSUMABLES,
  clamps: 4,
  materialPiles: [],
  player: {
    name: "Player",
    position: [2, 9], // the band saw's operation cell
    direction: 0,
    // One blank per saw. A machine takes the first board in hand, so the
    // second stays in the player's pocket while the first is being cut.
    inventory: [walnutBlank("test-blank-1"), walnutBlank("test-blank-2")],
    busyTicks: 0,
    away: null,
  },
  machines: [
    // Mid-shop, so a 6' blank has lane to travel both sides of the blade
    // (see feed-clearance.ts)
    idleMachine("bandSaw", [2, 7], "resaw", { targetThickness: 4 }),
    // The saw rests flat, so it rips until R stands the stock up
    idleMachine("jobsiteTableSaw", [8, 7], "ripBoard", {
      targetWidth: 4,
      targetThickness: 4,
    }),
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
    tutorials: {
      opening: { step: 0, dismissed: true },
      dust: { step: 0, dismissed: false },
    },
    storeUnlocked: true,
    lumberyardUnlocked: true,
    salesCompleted: 5,
    sweepingUnlocked: false,
    unlockedArticles: ALL_ARTICLE_IDS,
    readArticles: ALL_ARTICLE_IDS,
    xp: 0,
    skillPoints: 0,
    unlockedSkills: [...STARTER_SKILLS, "jigsAndFixtures", "resawing"],
  },
  stand: [],
  customers: [],
  dust: {},
  shopVac: null,
  broomOwned: true,
  broomPosition: [0, 0],
  dustpan: {},
};
