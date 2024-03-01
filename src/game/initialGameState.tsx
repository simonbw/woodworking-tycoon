import { GameState, Machine } from "./GameState";
import { MACHINES, MachineType } from "./MachineType";
import { Direction } from "./Vectors";
import { makeMaterial } from "./material-helpers";

export const initialGameState: GameState = {
  tick: 0,
  money: 0,
  reputation: 0,
  materialPiles: [
    { material: makeMaterial({ type: "pallet" }), position: [3, 5] },
  ],
  player: {
    name: "Player",
    position: [0, 0],
    direction: 0,
    inventory: [],
    workQueue: [],
    canWork: true,
  },
  machines: [
    // left workstation
    machine(MACHINES.makeshiftBench, [0, 1], 1),
    machine(MACHINES.makeshiftBench, [0, 2], 1),
    machine(MACHINES.makeshiftBench, [0, 3], 1),
    machine(MACHINES.workspace, [0, 2], 1),

    // miter station
    machine(MACHINES.makeshiftBench, [3, 0], 3),
    machine(MACHINES.makeshiftBench, [3, 1], 3),
    machine(MACHINES.makeshiftBench, [3, 2], 3),
    machine(MACHINES.miterSaw, [3, 1], 3),

    machine(MACHINES.jobsiteTableSaw, [2, 4], 2),

    // floor thing
    machine(MACHINES.workspace, [0, 5], 2),
  ],
  storage: {
    machines: [MACHINES.miterSaw, MACHINES.jobsiteTableSaw],
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
  return { type, position, rotation, materials: [] };
}
