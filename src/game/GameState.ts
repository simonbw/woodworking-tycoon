import { InputMaterialWithQuantity, MachineType } from "./MachineType";
import { MaterialInstance } from "./Materials";
import { Person } from "./Person";
import { ShopInfo } from "./ShopInfo";
import { Direction, Vector } from "./Vectors";

export type MaterialPile = {
  material: MaterialInstance;
  position: Vector;
};

export interface GameState {
  readonly money: number;
  readonly reputation: number;
  readonly materialPiles: ReadonlyArray<MaterialPile>;
  readonly tools: ReadonlyArray<Tool>;
  readonly machines: ReadonlyArray<Machine>;
  readonly commissions: ReadonlyArray<Commission>;
  readonly shopInfo: ShopInfo;
  readonly player: Person;
  readonly storage: {
    machines: ReadonlyArray<MachineType>;
  };
}

export interface Machine {
  readonly type: MachineType;
  readonly position: Vector;
  readonly rotation: Direction;
  readonly materials: ReadonlyArray<MaterialInstance>;
}

export interface Commission {
  readonly requiredMaterials: ReadonlyArray<InputMaterialWithQuantity>;
  readonly rewardMoney: number;
  readonly rewardReputation: number;
}

export interface Tool {
  readonly id: string;
  readonly name: string;
}

// TODO: Figure out how to guarantee that key and id fields always match
export const TOOLS = {
  handSaw: { id: "handSaw", name: "Hand Saw" },
} satisfies { [key: string]: Tool };
