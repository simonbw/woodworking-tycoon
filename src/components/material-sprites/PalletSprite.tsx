import { Graphics } from "pixi.js";
import React, { useCallback, useMemo } from "react";
import { Pallet } from "../../game/Materials";
import {
  faceNails,
  PALLET_HEIGHT_IN,
  PALLET_WIDTH_IN,
  palletBoardSlots,
  palletNailPosition,
} from "../../game/bench-work/pallet-geometry";
import { board } from "../../game/board-helpers";
import { omitUndefined } from "../../utils/objectUtils";
import { PIXELS_PER_INCH } from "../shop-view/shop-scale";
import { BoardSprite } from "./BoardSprite";

export type PalletLayer = "bottom" | "stringer" | "top";

/** Draw order for the shown face: the face's own deck reads on top. */
export function palletLayerOrder(flipped: boolean): ReadonlyArray<PalletLayer> {
  return flipped
    ? ["top", "stringer", "bottom"]
    : ["bottom", "stringer", "top"];
}

/**
 * A pallet drawn from its shared geometry (bench-work/pallet-geometry):
 * every board still nailed in and every nail whose head the shown face
 * presents, laid out exactly where the bench view's pry scene will find
 * them — the floor sprite and the zoomed scene are the same drawing at
 * two zooms, so they can never disagree about which boards remain or
 * where a nail is.
 *
 * `flipped` picks the face (the parent applies the actual mirror via a
 * negative x scale; this component only reorders layers and swaps which
 * nail heads show). `layers` optionally restricts drawing to a subset,
 * so the bench scene can interleave freed boards between the pallet's
 * own layers; nail heads ride the face's deck layer.
 */
export const PalletSprite: React.FC<{
  pallet: Pallet;
  flipped?: boolean;
  layers?: ReadonlyArray<PalletLayer>;
  alpha?: number;
  tint?: number;
}> = ({ pallet, flipped = false, layers, alpha, tint }) => {
  // The very boards prying frees (see pryPalletNailAction) — same dims,
  // and seeded below by the same slot id the freed board inherits, so a
  // pulled board keeps its exact grain lying in place.
  const deckBoard = useMemo(() => board("pallet", 36, 4, 2), []);
  const stringerBoard = useMemo(() => board("pallet", 48, 6, 6), []);

  const order = palletLayerOrder(flipped);
  const shown = layers ?? order;
  const faceLayer: PalletLayer = flipped ? "bottom" : "top";
  const slots = palletBoardSlots(pallet)
    .filter((slot) => shown.includes(slot.layer))
    .sort((a, b) => order.indexOf(a.layer) - order.indexOf(b.layer));

  // Nail heads at their crossings — pallet state, so a pried nail is
  // gone here in the shop view exactly as in the bench view. Only the
  // shown face's heads: the rest are driven from the other side.
  const drawNails = useCallback(
    (g: Graphics) => {
      g.clear();
      if (!shown.includes(faceLayer)) return;
      for (const nail of faceNails(pallet, flipped)) {
        const at = palletNailPosition(nail);
        const x = at.xIn * PIXELS_PER_INCH;
        const y = at.yIn * PIXELS_PER_INCH;
        g.circle(x, y, 1).fill({ color: 0x4a443e });
        g.circle(x - 0.3, y - 0.3, 0.4).fill({ color: 0x9a938c });
      }
    },
    [pallet, flipped, shown, faceLayer],
  );

  return (
    <pixiContainer
      x={(-PALLET_WIDTH_IN * PIXELS_PER_INCH) / 2}
      y={(-PALLET_HEIGHT_IN * PIXELS_PER_INCH) / 2}
      {...omitUndefined({ alpha })}
    >
      {slots.map((slot) => (
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
