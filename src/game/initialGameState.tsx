import { boolean } from "zod";
import { array } from "../utils/arrayUtils";
import { GameState } from "./GameState";
import { Machine } from "./Machine";
import { MACHINE_TYPES, MachineType } from "./Machine";
import { Pallet } from "./Materials";
import { Direction } from "./Vectors";
import { makeMaterial, makePallet } from "./material-helpers";

export const initialGameState: GameState = {
  tick: 0,
  money: 0,
  reputation: 0,
  materialPiles: [
    {
      material: makePallet(),
      position: [3, 5],
    },
  ],
  player: {
    name: "Player",
    position: [0, 0],
    direction: 0,
    inventory: [],
    workQueue: [],
    canWork: true,
    currentMachine: null,
  },
  machines: [
    // left workstation
    machine(MACHINE_TYPES.makeshiftBench, [0, 1], 1),
    machine(MACHINE_TYPES.workspace, [0, 1], 1),

    // miter station
    machine(MACHINE_TYPES.makeshiftBench, [3, 0], 3),
    machine(MACHINE_TYPES.makeshiftBench, [3, 1], 3),
    machine(MACHINE_TYPES.makeshiftBench, [3, 2], 3),
    machine(MACHINE_TYPES.miterSaw, [3, 1], 3),

    // Freestanding tools
    machine(MACHINE_TYPES.jobsiteTableSaw, [2, 4], 2),
    machine(MACHINE_TYPES.lunchboxPlaner, [0, 3], 0),
  ],
  storage: {
    machines: [MACHINE_TYPES.miterSaw, MACHINE_TYPES.jobsiteTableSaw],
  },
  commissions: [
    {
      requiredMaterials: [{ type: ["shelf"], quantity: 1 }],
      rewardMoney: 50,
      rewardReputation: 10,
    },
  ],
  shopInfo: {
    name: "One Car Garage",
    electricity: 120,
    size: [4, 6],
    materialDropoffPosition: [3, 5],
  },
};

// Helper method to create a machine with less boilerplate
function machine(
  type: MachineType,
  position: [number, number],
  rotation: Direction
): Machine {
  return {
    type,
    position,
    rotation,
    inputMaterials: [],
    outputMaterials: [],
    selectedOperation: type.operations[0],
    operationProgress: {
      status: "notStarted",
      ticksRemaining: 0,
    },
  };
}
