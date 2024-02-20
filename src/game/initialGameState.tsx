import { GameState } from "./GameState";
import { MACHINES } from "./MachineType";

export const initialGameState: GameState = {
  money: 0,
  reputation: 0,
  materials: [],
  tools: [],
  people: [{ name: "Player", position: [0, 0] }],
  machines: [
    { type: MACHINES.jobsiteTableSaw, position: [2, 3], rotation: 0 },
    { type: MACHINES.makeshiftWorkbench, position: [0, 0], rotation: 0 },
  ],
  commissions: [
    {
      requiredMaterials: [{ type: "shelf", quantity: 1 }],
      rewardMoney: 50,
      rewardReputation: 10,
    },
  ],
  shopInfo: {
    name: "One Car Garage",
    electricity: 120,
    size: [4, 6],
  },
};
