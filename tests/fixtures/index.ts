import { GameState } from "../../src/game/GameState";
import { consumablesShop } from "./consumables-shop";
import { cuttingBoardShop } from "./cutting-board-shop";
import { miterSawCrateShop } from "./miter-saw-crate-shop";
import { layoutWithPlacedMachines } from "./layout-with-placed-machines";
import { millingShop } from "./milling-shop";
import { resawShop } from "./resaw-shop";
import { miterFrameShop } from "./miter-frame-shop";
import { patternBoardShop } from "./pattern-board-shop";
import { endGrainShop } from "./end-grain-shop";
import { handToolsShop } from "./hand-tools-shop";
import { benchWorkShop } from "./bench-work-shop";

export const TEST_FIXTURES: Record<string, GameState> = {
  "miter-saw-crate-shop": miterSawCrateShop,
  "layout-with-placed-machines": layoutWithPlacedMachines,
  "cutting-board-shop": cuttingBoardShop,
  "pattern-board-shop": patternBoardShop,
  "end-grain-shop": endGrainShop,
  "consumables-shop": consumablesShop,
  "hand-tools-shop": handToolsShop,
  "bench-work-shop": benchWorkShop,
  "milling-shop": millingShop,
  "resaw-shop": resawShop,
  "miter-frame-shop": miterFrameShop,
};

// Expose fixtures to window for manual testing
if (typeof window !== "undefined") {
  (window as any).__TEST_FIXTURES__ = TEST_FIXTURES;
}
