import { GameState } from "../../src/game/GameState";
import { cuttingBoardShop } from "./cutting-board-shop";
import { freeSellingShop } from "./free-selling-shop";
import { layoutWithMiterSawInStorage } from "./layout-with-miter-saw-in-storage";
import { layoutWithPlacedMachines } from "./layout-with-placed-machines";
import { patternBoardShop } from "./pattern-board-shop";

export const TEST_FIXTURES: Record<string, GameState> = {
  "layout-with-miter-saw-in-storage": layoutWithMiterSawInStorage,
  "layout-with-placed-machines": layoutWithPlacedMachines,
  "free-selling-shop": freeSellingShop,
  "cutting-board-shop": cuttingBoardShop,
  "pattern-board-shop": patternBoardShop,
};

// Expose fixtures to window for manual testing
if (typeof window !== "undefined") {
  (window as any).__TEST_FIXTURES__ = TEST_FIXTURES;
}
