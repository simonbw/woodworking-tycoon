import { Graphics } from "pixi.js";
import React, { useCallback, useMemo } from "react";
import { Pallet } from "../../game/Materials";
import {
  PALLET_HEIGHT_IN,
  PALLET_WIDTH_IN,
  palletBoardSlots,
  palletNailPosition,
} from "../../game/bench-work/pallet-geometry";
import { board } from "../../game/board-helpers";
import { omitUndefined } from "../../utils/objectUtils";
import { PIXELS_PER_INCH } from "../shop-view/shop-scale";
import { BoardSprite } from "./BoardSprite";

/**
 * A pallet drawn from its shared geometry (bench-work/pallet-geometry):
 * every board still nailed in and every nail still driven, laid out
 * exactly where the bench view's pry scene will find them — the floor
 * sprite and the zoomed scene are the same drawing at two zooms, so
 * they can never disagree about which boards remain or where a nail is.
 */
export const PalletSprite: React.FC<{
  pallet: Pallet;
  alpha?: number;
  tint?: number;
}> = ({ pallet, alpha, tint }) => {
  // The very boards prying frees (see pryPalletNailAction) — same dims,
  // and seeded below by the same slot id the freed board inherits, so a
  // pulled board keeps its exact grain lying in place.
  const deckBoard = useMemo(() => board("pallet", 3, 4, 1), []);
  const stringerBoard = useMemo(() => board("pallet", 4, 6, 3), []);

  // Nail heads at their crossings — pallet state, so a pried nail is
  // gone here in the shop view exactly as in the bench view.
  const drawNails = useCallback(
    (g: Graphics) => {
      g.clear();
      for (const nail of pallet.nails) {
        const at = palletNailPosition(nail);
        const x = at.xIn * PIXELS_PER_INCH;
        const y = at.yIn * PIXELS_PER_INCH;
        g.circle(x, y, 1).fill({ color: 0x4a443e });
        g.circle(x - 0.3, y - 0.3, 0.4).fill({ color: 0x9a938c });
      }
    },
    [pallet.nails],
  );

  return (
    <pixiContainer
      x={(-PALLET_WIDTH_IN * PIXELS_PER_INCH) / 2}
      y={(-PALLET_HEIGHT_IN * PIXELS_PER_INCH) / 2}
      {...omitUndefined({ alpha })}
    >
      {palletBoardSlots(pallet).map((slot) => (
        <pixiContainer
          key={`${slot.target.kind}-${slot.target.index}`}
          x={slot.xIn * PIXELS_PER_INCH}
          y={slot.yIn * PIXELS_PER_INCH}
          angle={slot.angleDeg}
        >
          <BoardSprite
            board={slot.layer === "stringer" ? stringerBoard : deckBoard}
            seed={`${pallet.id}:${slot.target.kind}-${slot.target.index}`}
            tint={tint}
          />
        </pixiContainer>
      ))}
      <pixiGraphics draw={drawNails} />
    </pixiContainer>
  );
};
