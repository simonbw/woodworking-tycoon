import { GameAction } from "../GameState";

export function giveMoneyAction(amount: number): GameAction {
  return (gameState) => {
    return {
      ...gameState,
      money: gameState.money + amount,
    };
  };
}

export function combineActions(...actions: GameAction[]): GameAction {
  return (gameState) => {
    return actions.reduce((state, action) => action(state), gameState);
  };
}
