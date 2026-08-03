import assert from "node:assert";
import { describe, it } from "node:test";
import { Pallet } from "../Materials";
import { Tuple } from "../../utils/typeUtils";
import {
  deckBoardXIn,
  faceNails,
  initialPalletNails,
  MAX_BOTTOM_DECK,
  MAX_STRINGERS,
  MAX_TOP_DECK,
  PALLET_HEIGHT_IN,
  PALLET_WIDTH_IN,
  palletBoardSlot,
  palletBoardSlots,
  palletNailPosition,
  palletSlotRefFromId,
  stringerYIn,
} from "./pallet-geometry";
import { pryTargets } from "./workpiece";

function pallet(deckLeft: number, stringersLeft: number): Pallet {
  const deckBoards = Array.from(
    { length: 11 },
    (_, i) => i < deckLeft,
  ) as Tuple<boolean, 11>;
  const stringers = Array.from(
    { length: 3 },
    (_, i) => i < stringersLeft,
  ) as Tuple<boolean, 3>;
  return {
    id: "geo-pallet",
    type: "pallet",
    deckBoards,
    stringers,
    nails: initialPalletNails(deckBoards, stringers),
  };
}

describe("pallet geometry", () => {
  it("lays out one slot per remaining board, layered bottom to top", () => {
    const slots = palletBoardSlots(pallet(11, 3));
    assert.strictEqual(slots.length, MAX_BOTTOM_DECK + MAX_TOP_DECK + 3);
    // Bottom deck draws first, top deck last, stringers in between
    assert.strictEqual(slots[0].layer, "bottom");
    assert.strictEqual(slots[slots.length - 1].layer, "top");
    assert.strictEqual(
      slots.filter((s) => s.layer === "stringer").length,
      MAX_STRINGERS,
    );
  });

  it("a fresh pallet carries a nail at every crossing of present boards", () => {
    const full = pallet(11, 3);
    assert.strictEqual(full.nails.length, 11 * 3);
    // A weathered one only nails the wood that's actually there
    const worn = initialPalletNails(
      [true, false, true, ...Array(8).fill(false)],
      [true, true, false],
    );
    assert.deepStrictEqual(worn, [
      { deck: 0, stringer: 0 },
      { deck: 0, stringer: 1 },
      { deck: 2, stringer: 0 },
      { deck: 2, stringer: 1 },
    ]);
  });

  it("every nail sits exactly on its two boards' centerlines, inside the span", () => {
    for (const nail of pryTargets(pallet(11, 3))) {
      const at = palletNailPosition(nail);
      assert.strictEqual(at.xIn, deckBoardXIn(nail.deck));
      assert.strictEqual(at.yIn, stringerYIn(nail.stringer));
      assert.ok(at.xIn >= 0 && at.xIn <= PALLET_WIDTH_IN);
      assert.ok(at.yIn >= 0 && at.yIn <= PALLET_HEIGHT_IN);
    }
  });

  it("each face presents only its own deck's nail heads", () => {
    const full = pallet(11, 3);
    const top = faceNails(full, false);
    const bottom = faceNails(full, true);
    assert.strictEqual(top.length, 7 * 3);
    assert.strictEqual(bottom.length, 4 * 3);
    assert.ok(top.every((n) => n.deck >= MAX_BOTTOM_DECK));
    assert.ok(bottom.every((n) => n.deck < MAX_BOTTOM_DECK));
  });

  it("recovers a freed board's slot from its id", () => {
    const full = pallet(11, 3);
    assert.deepStrictEqual(palletSlotRefFromId(full.id, `${full.id}:deck-6`), {
      kind: "deck",
      index: 6,
    });
    assert.strictEqual(palletSlotRefFromId(full.id, "some-maple-board"), null);
  });

  it("a freed board's berth stays where it was nailed", () => {
    // The slot is a pure function of the target, present or not — the
    // bench view lays the freed board right back on its berth.
    const before = palletBoardSlot({ kind: "deck", index: 6 });
    const slots = palletBoardSlots(pallet(6, 3));
    assert.ok(
      !slots.some((s) => s.target.index === 6 && s.target.kind === "deck"),
    );
    const again = palletBoardSlot({ kind: "deck", index: 6 });
    assert.deepStrictEqual(again, before);
  });
});
