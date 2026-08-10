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

/** Every deck berth on a whole pallet, bottom row then top. */
const DECK_COUNT = MAX_BOTTOM_DECK + MAX_TOP_DECK;

function pallet(deckLeft: number, stringersLeft: number): Pallet {
  const deckBoards = Array.from(
    { length: DECK_COUNT },
    (_, i) => i < deckLeft,
  ) as Tuple<boolean, 8>;
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
    const slots = palletBoardSlots(pallet(DECK_COUNT, MAX_STRINGERS));
    assert.strictEqual(slots.length, DECK_COUNT + MAX_STRINGERS);
    // Bottom deck draws first, top deck last, stringers in between
    assert.strictEqual(slots[0].layer, "bottom");
    assert.strictEqual(slots[slots.length - 1].layer, "top");
    assert.strictEqual(
      slots.filter((s) => s.layer === "stringer").length,
      MAX_STRINGERS,
    );
  });

  it("a fresh pallet carries a nail at every crossing of present boards", () => {
    const full = pallet(DECK_COUNT, MAX_STRINGERS);
    assert.strictEqual(full.nails.length, DECK_COUNT * MAX_STRINGERS);
    // A weathered one only nails the wood that's actually there
    const worn = initialPalletNails(
      [true, false, true, ...Array(DECK_COUNT - 3).fill(false)],
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
    for (const nail of pryTargets(pallet(DECK_COUNT, MAX_STRINGERS))) {
      const at = palletNailPosition(nail);
      assert.strictEqual(at.xIn, deckBoardXIn(nail.deck));
      assert.strictEqual(at.yIn, stringerYIn(nail.stringer));
      assert.ok(at.xIn >= 0 && at.xIn <= PALLET_WIDTH_IN);
      assert.ok(at.yIn >= 0 && at.yIn <= PALLET_HEIGHT_IN);
    }
  });

  it("each face presents only its own deck's nail heads", () => {
    const full = pallet(DECK_COUNT, MAX_STRINGERS);
    const top = faceNails(full, false);
    const bottom = faceNails(full, true);
    assert.strictEqual(top.length, MAX_TOP_DECK * MAX_STRINGERS);
    assert.strictEqual(bottom.length, MAX_BOTTOM_DECK * MAX_STRINGERS);
    assert.ok(top.every((n) => n.deck >= MAX_BOTTOM_DECK));
    assert.ok(bottom.every((n) => n.deck < MAX_BOTTOM_DECK));
  });

  it("recovers a freed board's slot from its id", () => {
    const full = pallet(DECK_COUNT, MAX_STRINGERS);
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
    const slots = palletBoardSlots(pallet(6, MAX_STRINGERS));
    assert.ok(
      !slots.some((s) => s.target.index === 6 && s.target.kind === "deck"),
    );
    const again = palletBoardSlot({ kind: "deck", index: 6 });
    assert.deepStrictEqual(again, before);
  });
});
