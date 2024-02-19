import { GameState, MACHINES, MATERIALS } from "./GameState";

export const initialGameState: GameState = {
  money: 0,
  materials: [],
  tools: [],
  machines: [{ machine: MACHINES.workBench, position: [0, 0], rotation: 0 }],
  commissions: [
    {
      requiredMaterials: [MATERIALS.shelf, MATERIALS.shelf],
      reward: 50,
    },
  ],
  shopInfo: {
    size: [5, 5],
  },
};
