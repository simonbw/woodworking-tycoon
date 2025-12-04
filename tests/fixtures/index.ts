import { GameState } from "../../src/game/GameState";
import layoutWithMiterSawInStorage from "./layout-with-miter-saw-in-storage.json";
import layoutWithPlacedMachines from "./layout-with-placed-machines.json";

export const TEST_FIXTURES: Record<string, GameState> = {
  "layout-with-miter-saw-in-storage": layoutWithMiterSawInStorage as unknown as GameState,
  "layout-with-placed-machines": layoutWithPlacedMachines as unknown as GameState,
};

// Expose fixtures to window for manual testing
if (typeof window !== "undefined") {
  (window as any).__TEST_FIXTURES__ = TEST_FIXTURES;
}
