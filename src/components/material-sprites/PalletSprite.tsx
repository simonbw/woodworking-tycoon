import React, { useMemo } from "react";
import { Pallet } from "../../game/Materials";
import {
  PALLET_HEIGHT_IN,
  PALLET_WIDTH_IN,
  palletBoardSlots,
} from "../../game/bench-work/pallet-geometry";
import { board } from "../../game/board-helpers";
import { omitUndefined } from "../../utils/objectUtils";
import { PIXELS_PER_INCH } from "../shop-view/shop-scale";
import { BoardSprite } from "./BoardSprite";

/**
 * A pallet drawn from its shared geometry (bench-work/pallet-geometry):
 * every board still nailed in, laid out exactly where the bench view's
 * pry scene will find it — the floor sprite and the zoomed scene can
 * never disagree about which boards remain or where they lie.
 */
export const PalletSprite: React.FC<{
  pallet: Pallet;
  alpha?: number;
  tint?: number;
}> = ({ pallet, alpha, tint }) => {
  const deckBoard = useMemo(() => board("pallet", 3, 4, 2), []);
  const stringerBoard = useMemo(() => board("pallet", 4, 1, 2), []);

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
            seed={`${slot.target.kind}-${slot.target.index}`}
            tint={tint}
          />
        </pixiContainer>
      ))}
    </pixiContainer>
  );
};
