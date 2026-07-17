import { GameState } from "../../src/game/GameState";
import { consumablesShop } from "./consumables-shop";
import { cuttingBoardShop } from "./cutting-board-shop";
import { freeSellingShop } from "./free-selling-shop";
import { layoutWithMiterSawInStorage } from "./layout-with-miter-saw-in-storage";
import { layoutWithPlacedMachines } from "./layout-with-placed-machines";
import { patternBoardShop } from "./pattern-board-shop";
import { endGrainShop } from "./end-grain-shop";

export const TEST_FIXTURES: Record<string, GameState> = {
  "layout-with-miter-saw-in-storage": layoutWithMiterSawInStorage,
  "layout-with-placed-machines": layoutWithPlacedMachines,
  "free-selling-shop": freeSellingShop,
  "cutting-board-shop": cuttingBoardShop,
  "pattern-board-shop": patternBoardShop,
  "end-grain-shop": endGrainShop,
  "consumables-shop": consumablesShop,
};

// Expose fixtures to window for manual testing
if (typeof window !== "undefined") {
  (window as any).__TEST_FIXTURES__ = TEST_FIXTURES;
}
