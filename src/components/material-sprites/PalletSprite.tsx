import React from "react";
import { array } from "../../utils/arrayUtils";
import { board } from "../../game/material-helpers";
import { PIXELS_PER_INCH } from "../shop-view/MaterialPileSprite";
import { BoardSprite } from "./BoardSprite";

export const PalletSprite: React.FC = () => {
  const width = 48 * PIXELS_PER_INCH;
  const height = 36 * PIXELS_PER_INCH;
  return (
    <g transform="scale(0.8) rotate(90)">
      {/* bottom deck boards */}
      {array(4).map((i) => (
        <g
          key={i}
          transform={`translate(${
            (i / 3 - 0.5) * (width - 4 * PIXELS_PER_INCH)
          } 0)`}
        >
          <BoardSprite board={board("pallet", 3, 4, 1)} />
        </g>
      ))}
      {/* Stringers */}
      {array(3).map((i) => (
        <g
          key={i}
          transform={`translate(0 ${
            (i / 2 - 0.5) * (height - 4 * PIXELS_PER_INCH)
          }) rotate(90)`}
        >
          <BoardSprite board={board("pallet", 4, 2, 3)} />
        </g>
      ))}

      {/* top deck boards */}
      {array(7).map((i) => (
        <g
          key={i}
          transform={`translate(${
            (i / 6 - 0.5) * (width - 4 * PIXELS_PER_INCH)
          } 0)`}
        >
          <BoardSprite board={board("pallet", 3, 4, 1)} />
        </g>
      ))}
    </g>
  );
};
