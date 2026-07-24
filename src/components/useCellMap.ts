import { CellMap } from "../game/CellMap";
import { useGameState } from "./useGameState";

/** The current GameState's CellMap (cached per state — see CellMap). */
export const useCellMap = (): CellMap => {
  const gameState = useGameState();
  return CellMap.fromGameState(gameState);
};
