import React from "react";
import { tickAction } from "../game/game-actions/tickAction";
import { makeMaterial } from "../game/material-helpers";
import { useGameActions } from "./useGameActions";
import { useApplyGameAction, useGameState } from "./useGameState";

// Just a bunch of debug crap
export const ActionBar: React.FC = () => {
  const gameState = useGameState();
  const { addMaterial } = useGameActions();

  return (
    <section className="space-y-2">
      <button
        className="button"
        onClick={() =>
          addMaterial(makeMaterial({ type: "pallet" }), [
            gameState.shopInfo.size[0] - 1,
            gameState.shopInfo.size[1] - 1,
          ])
        }
      >
        Find a Pallet
      </button>
    </section>
  );
};
