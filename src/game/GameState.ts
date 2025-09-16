import { Machine } from "./Machine";
import { InputMaterialWithQuantity, MachineType } from "./Machine";
import { MaterialInstance } from "./Materials";
import { Person } from "./Person";
import { ShopInfo } from "./ShopInfo";
import { Vector } from "./Vectors";

export type MaterialPile = {
  material: MaterialInstance;
  position: Vector;
};

export type GameAction = (gameState: GameState) => GameState;

/** Represents all of the state for the game simulation. This is what gets loaded/saved. Does not include UI state. */
export interface ProgressionState {
  readonly tutorialStage: number;
  readonly storeUnlocked: boolean;
  readonly shopLayoutUnlocked: boolean;
  readonly freeSelling: boolean;
  readonly commissionsCompleted: number;
}

export interface GameState {
  readonly tick: number;
  readonly money: number;
  readonly reputation: number;
  readonly materialPiles: ReadonlyArray<MaterialPile>;
  readonly machines: ReadonlyArray<Machine>;
  readonly commissions: ReadonlyArray<Commission>;
  readonly shopInfo: ShopInfo;
  readonly player: Person;
  readonly storage: {
    machines: ReadonlyArray<MachineType>;
  };
  readonly progression: ProgressionState;
}

export interface Commission {
  readonly requiredMaterials: ReadonlyArray<InputMaterialWithQuantity>;
  readonly rewardMoney: number;
  readonly rewardReputation: number;
}
