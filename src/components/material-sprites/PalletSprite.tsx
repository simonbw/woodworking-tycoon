import { Container } from "@pixi/react";
import React, { useMemo } from "react";
import { Pallet } from "../../game/Materials";
import { board } from "../../game/board-helpers";
import { array } from "../../utils/arrayUtils";
import { lerp } from "../../utils/mathUtils";
import { INCHES_PER_FOOT, PIXELS_PER_INCH } from "../shop-view/shop-scale";
import { BoardSprite } from "./BoardSprite";

export const MAX_STRINGERS = 3;
export const MAX_TOP_DECK = 7;
export const MAX_BOTTOM_DECK = 4;

export const PalletSprite: React.FC<{ pallet: Pallet }> = ({ pallet }) => {
  const bottom = pallet.deckBoards.slice(0, MAX_BOTTOM_DECK);
  const top = pallet.deckBoards.slice(
    MAX_BOTTOM_DECK,
    MAX_BOTTOM_DECK + MAX_TOP_DECK
  );

  const deckBoard = useMemo(() => board("pallet", 3, 4, 2), []);
  const stringerBoard = useMemo(() => board("pallet", 4, 1, 2), []);

  const totalWidth = (4 * INCHES_PER_FOOT - 2) * PIXELS_PER_INCH;
  const totalHeight = (3 * INCHES_PER_FOOT - 2) * PIXELS_PER_INCH;

  return (
    <Container x={-totalWidth / 2} y={-totalHeight / 2}>
      {bottom.map(
        (boardExists, i) =>
          boardExists && (
            <BoardSprite
              board={deckBoard}
              key={`bottom-${i}`}
              x={lerp(0, totalWidth, i / (MAX_BOTTOM_DECK - 1))}
              y={totalHeight / 2}
              anchor={-0.5}
            />
          )
      )}

      {array(pallet.stringerBoardsLeft).map((_, i) => (
        <BoardSprite
          board={stringerBoard}
          key={`stringer-${i}`}
          x={totalWidth / 2}
          y={lerp(0, totalHeight, i / (MAX_STRINGERS - 1))}
          angle={90}
          anchor={-0.5}
        />
      ))}

      {top.map(
        (boardExists, i) =>
          boardExists && (
            <BoardSprite
              board={deckBoard}
              key={`top-${i}`}
              x={lerp(0, totalWidth, i / (MAX_TOP_DECK - 1))}
              y={totalHeight / 2}
              anchor={-0.5}
            />
          )
      )}
    </Container>
  );
};
