import React from "react";
import { makeMaterial } from "../game/material-helpers";
import { useUiMode } from "./UiMode";
import { useGameActions } from "./useGameActions";
import { useGameState } from "./useGameState";

export const MaterialsSection: React.FC = () => {
  const { gameState } = useGameState();
  const { addMaterial } = useGameActions();
  const { setMode } = useUiMode();

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
      <button className="button" onClick={() => setMode({ mode: "store" })}>
        Go To Store
      </button>
      <button
        className="button"
        onClick={() => setMode({ mode: "shopLayout" })}
      >
        Go To Layout
      </button>
    </section>
  );
};
