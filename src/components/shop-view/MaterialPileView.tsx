import React from "react";
import { MaterialPile } from "../../game/GameState";

export const MaterialPileView: React.FC<{
  materialPile: MaterialPile;
}> = ({ materialPile }) => {
  const [x, y] = materialPile.position;
  return (
    <>
      <circle
        cx={0.5}
        cy={0.5}
        r={0.1}
        className="fill-red-500"
        style={{ transform: `translate(${x}px, ${y}px)` }}
      />
    </>
  );
};
