import { Container, Graphics } from "pixi.js";
import { createBoardSprite } from "./board";
import { PIXELS_PER_INCH } from "../shop-scale";
import {
  faceNails,
  PALLET_HEIGHT_IN,
  PALLET_WIDTH_IN,
  palletBoardSlots,
  palletNailPosition,
} from "../../game/bench-work/pallet-geometry";
import { palletBoard } from "../../game/board-helpers";
import { Pallet } from "../../game/Materials";

export type PalletLayer = "bottom" | "stringer" | "top";

/** Draw order for the shown face: the face's own deck reads on top. */
export function palletLayerOrder(flipped: boolean): ReadonlyArray<PalletLayer> {
  return flipped
    ? ["top", "stringer", "bottom"]
    : ["bottom", "stringer", "top"];
}

export interface PalletSpriteOptions {
  flipped?: boolean;
  layers?: ReadonlyArray<PalletLayer>;
  alpha?: number;
  tint?: number;
}

/**
 * A pallet drawn from its shared geometry (bench-work/pallet-geometry):
 * every board still nailed in and every nail whose head the shown face
 * presents, laid out exactly where the bench view's pry scene will find
 * them — the floor sprite and the zoomed scene are the same drawing at
 * two zooms, so they can never disagree about which boards remain or
 * where a nail is. The old PalletSprite as an imperative builder.
 *
 * `flipped` picks the face (the caller applies the actual mirror via a
 * negative x scale; this builder only reorders layers and swaps which
 * nail heads show). `layers` optionally restricts drawing to a subset,
 * so the bench scene can interleave freed boards between the pallet's
 * own layers; nail heads ride the face's deck layer.
 *
 * Returns a Container centered on the pallet; the caller owns its
 * transform and lifecycle.
 */
export function createPalletSprite(
  pallet: Pallet,
  options: PalletSpriteOptions = {},
): Container {
  const { flipped = false, layers, alpha, tint } = options;
  const root = new Container();
  if (alpha !== undefined) {
    root.alpha = alpha;
  }

  const inner = root.addChild(new Container());
  inner.position.set(
    (-PALLET_WIDTH_IN * PIXELS_PER_INCH) / 2,
    (-PALLET_HEIGHT_IN * PIXELS_PER_INCH) / 2,
  );

  // The very board prying frees (see pryPalletNailAction) — one piece of
  // stock for every berth, seeded below by the same slot id the freed
  // board inherits, so a pulled board keeps its exact grain lying in
  // place. The mint-time face placement is stripped: it's seeded by this
  // throwaway instance's fresh id, and left on it would out-rank the
  // slot seed and reroll every board's grain on every redraw.
  const { face: _mintFace, ...palletStock } = palletBoard();

  const order = palletLayerOrder(flipped);
  const shown = layers ?? order;
  const faceLayer: PalletLayer = flipped ? "bottom" : "top";
  const slots = palletBoardSlots(pallet)
    .filter((slot) => shown.includes(slot.layer))
    .sort((a, b) => order.indexOf(a.layer) - order.indexOf(b.layer));

  for (const slot of slots) {
    const slotContainer = inner.addChild(new Container());
    slotContainer.position.set(
      slot.xIn * PIXELS_PER_INCH,
      slot.yIn * PIXELS_PER_INCH,
    );
    slotContainer.angle = slot.angleDeg;
    slotContainer.addChild(
      createBoardSprite(
        palletStock,
        `${pallet.id}:${slot.target.kind}-${slot.target.index}`,
        { tint },
      ),
    );
  }

  // Nail heads at their crossings — pallet state, so a pried nail is
  // gone here in the shop view exactly as in the bench view. Only the
  // shown face's heads: the rest are driven from the other side.
  const nailsG = inner.addChild(new Graphics());
  if (shown.includes(faceLayer)) {
    for (const nail of faceNails(pallet, flipped)) {
      const at = palletNailPosition(nail);
      const x = at.xIn * PIXELS_PER_INCH;
      const y = at.yIn * PIXELS_PER_INCH;
      nailsG.circle(x, y, 1).fill({ color: 0x4a443e });
      nailsG.circle(x - 0.3, y - 0.3, 0.4).fill({ color: 0x9a938c });
    }
  }

  return root;
}
