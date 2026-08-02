import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import { Board, MaterialInstance } from "../../game/Materials";
import { colorToNumber, mixColors } from "../../utils/colorUtils";
import { colorBySpecies } from "../shop-view/colorBySpecies";
import { INCHES_PER_FOOT, PIXELS_PER_INCH } from "../shop-view/shop-scale";

const WEATHERED_GRAY = 0x9a9186;

/**
 * A board seen edge-on for the block plane's edge work: the narrow strip
 * (thickness × length) the strokes are constrained to. Unjointed it's
 * weathered and saw-marked; the finished state shows the species' edge
 * color with clean grain lines — the same reveal the face gets.
 */
export const EdgeBandSprite: React.FC<{
  material: MaterialInstance;
  finished: boolean;
}> = ({ material, finished }) => {
  const draw = useCallback(
    (g: Graphics) => {
      g.clear();
      if (material.type !== "board") {
        return;
      }
      const board = material as Board;
      const width = (board.thickness / 4) * PIXELS_PER_INCH;
      const height = board.length * INCHES_PER_FOOT * PIXELS_PER_INCH;
      const { secondary } = colorBySpecies[board.species];
      const color = finished
        ? colorToNumber(secondary)
        : mixColors(secondary, WEATHERED_GRAY, 0.55);
      g.rect(-width / 2, -height / 2, width, height).fill(color);
      if (finished) {
        // Straightened: crisp grain lines run the length
        for (let i = 1; i < 3; i++) {
          g.moveTo(-width / 2 + (width * i) / 3, -height / 2)
            .lineTo(-width / 2 + (width * i) / 3, height / 2)
            .stroke({
              width: 0.5,
              color: mixColors(secondary, 0x000000, 0.25),
              alpha: 0.5,
            });
        }
      } else {
        // Rough: cross marks where the mill's saw chattered
        for (let y = -height / 2 + 3; y < height / 2; y += 7) {
          g.moveTo(-width / 2, y)
            .lineTo(width / 2, y + 2)
            .stroke({ width: 0.5, color: 0x000000, alpha: 0.12 });
        }
      }
    },
    [material, finished],
  );
  return <pixiGraphics draw={draw} />;
};
