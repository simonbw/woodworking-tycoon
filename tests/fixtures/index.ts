import { GameState } from "../../src/game/GameState";
import { layoutWithMiterSawInStorage } from "./layout-with-miter-saw-in-storage";
import { layoutWithPlacedMachines } from "./layout-with-placed-machines";

export const TEST_FIXTURES: Record<string, GameState> = {
  "layout-with-miter-saw-in-storage": layoutWithMiterSawInStorage,
  "layout-with-placed-machines": layoutWithPlacedMachines,
};

// Expose fixtures to window for manual testing
if (typeof window !== "undefined") {
  (window as any).__TEST_FIXTURES__ = TEST_FIXTURES;
}
