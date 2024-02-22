import { GameState } from "./GameState";
import { MACHINES } from "./MachineType";
import { makeMaterial } from "./material-helpers";

export const initialGameState: GameState = {
  money: 0,
  reputation: 0,
  materialPiles: [
    { material: makeMaterial({ type: "pallet" }), position: [3, 5] },
  ],
  tools: [],
  player: { name: "Player", position: [0, 0], inventory: [] },
  machines: [
    { type: MACHINES.jobsiteTableSaw, position: [1, 3], rotation: 2 },
    { type: MACHINES.makeshiftWorkbench, position: [3, 0], rotation: 3 },
    { type: MACHINES.makeshiftWorkbench, position: [3, 1], rotation: 3 },
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
