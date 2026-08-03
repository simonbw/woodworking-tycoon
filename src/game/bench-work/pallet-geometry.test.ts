import assert from "node:assert";
import { describe, it } from "node:test";
import { Pallet } from "../Materials";
import { Tuple } from "../../utils/typeUtils";
import {
  MAX_BOTTOM_DECK,
  MAX_STRINGERS,
  MAX_TOP_DECK,
  PALLET_HEIGHT_IN,
  PALLET_WIDTH_IN,
  palletBoardSlot,
  palletBoardSlots,
  palletNailPosition,
} from "./pallet-geometry";
import { pryTargets } from "./workpiece";

function pallet(deckLeft: number, stringersLeft: number): Pallet {
  return {
    id: "geo-pallet",
    type: "pallet",
    deckBoards: Array.from({ length: 11 }, (_, i) => i < deckLeft) as Tuple<
      boolean,
      11
    >,
    stringerBoardsLeft: stringersLeft,
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

  it("keeps every board and nail inside the pallet's span", () => {
    for (const target of pryTargets(pallet(11, 3))) {
      const slot = palletBoardSlot(target);
      const nail = palletNailPosition(target);
      for (const [x, y] of [
        [slot.xIn, slot.yIn],
        [nail.xIn, nail.yIn],
      ]) {
        assert.ok(x >= 0 && x <= PALLET_WIDTH_IN, `${target.kind} x=${x}`);
        assert.ok(y >= 0 && y <= PALLET_HEIGHT_IN, `${target.kind} y=${y}`);
      }
    }
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

  it("deck nails sit by the middle stringer, stringers at mid-span", () => {
    const bottomNail = palletNailPosition({ kind: "deck", index: 1 });
    assert.strictEqual(bottomNail.yIn, PALLET_HEIGHT_IN / 2 + 6);
    const topNail = palletNailPosition({
      kind: "deck",
      index: MAX_BOTTOM_DECK,
    });
    assert.strictEqual(topNail.yIn, PALLET_HEIGHT_IN / 2 - 6);
    const stringerNail = palletNailPosition({ kind: "stringer", index: 1 });
    assert.strictEqual(stringerNail.xIn, PALLET_WIDTH_IN / 2);
    assert.strictEqual(stringerNail.yIn, PALLET_HEIGHT_IN / 2);
  });
});
