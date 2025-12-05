import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import { CellInfo } from "../../game/CellMap";
import { colors } from "../../utils/colors";
import { PIXELS_PER_CELL, SPACING } from "./shop-scale";

export const FloorTileSprite: React.FC<{
  cell: CellInfo;
  onClick?: (position: [number, number]) => void;
  onHover?: (position: [number, number]) => void;
  onHoverOut?: () => void;
}> = ({ cell, onClick, onHover, onHoverOut }) => {
  const size = PIXELS_PER_CELL - SPACING * 2;
  const draw = useCallback((g: Graphics) => {
    g.clear();
    g.rect(SPACING, SPACING, size, size);
    g.fill(colors.zinc[700]);
  }, []);

  const handleClick = useCallback(() => {
    onClick?.(cell.position as [number, number]);
  }, [onClick, cell.position]);

  return (
    <pixiGraphics
      eventMode="static"
      x={cell.position[0] * PIXELS_PER_CELL}
      y={cell.position[1] * PIXELS_PER_CELL}
      draw={draw}
      alpha={0.1}
      onClick={handleClick}
      onPointerOver={() => onHover?.(cell.position as [number, number])}
      onPointerOut={() => onHoverOut?.()}
    />
  );
};
