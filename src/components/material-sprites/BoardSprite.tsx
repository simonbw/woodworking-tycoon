import React from "react";
import { Board } from "../../game/Materials";
import { classNames } from "../../utils/classNames";
import {
  PIXELS_PER_INCH,
  classNameBySpecies,
} from "../shop-view/MaterialPileSprite";

export const BoardSprite: React.FC<{ board: Omit<Board, "id" | "type"> }> = ({
  board,
}) => {
  const { width: boardWidth, length: boardLength } = board;

  const width = boardWidth * PIXELS_PER_INCH;
  const height = boardLength * 12 * PIXELS_PER_INCH;
  return (
    <rect
      x={-width / 2}
      y={-height / 2}
      width={width}
      height={height}
      className={classNames(
        "drop-shadow-md",
        classNameBySpecies[board.species]
      )}
    />
  );
};
