import { InputMaterialWithQuantity, MachineType } from "./MachineType";
import { MaterialInstance } from "./Materials";
import { Direction, Vector } from "./Vectors";
import { ShopInfo } from "./ShopInfo";

export interface GameState {
  readonly money: number;
  readonly reputation: number;
  readonly materials: ReadonlyArray<MaterialInstance>;
  readonly tools: ReadonlyArray<Tool>;
  readonly machines: ReadonlyArray<Machine>;
  readonly commissions: ReadonlyArray<Commission>;
  readonly shopInfo: ShopInfo;
  readonly people: ReadonlyArray<Person>;
}

export interface Person {
  name: string;
  position: Vector;
}

export interface Machine {
  readonly type: MachineType;
  readonly position: Vector;
  readonly rotation: Direction;
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
