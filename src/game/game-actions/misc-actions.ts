import { GameAction } from "../GameState";

export function combineActions(...actions: GameAction[]): GameAction {
  return (gameState) => {
    return actions.reduce((state, action) => action(state), gameState);
  };
}
