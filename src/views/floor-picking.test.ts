import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "../game/board-helpers";
import { freshMachineState } from "../game/game-actions/machine-actions";
import { MaterialPile } from "../game/GameState";
import { initialGameState } from "../game/initialGameState";
import { Machine } from "../game/Machine";
import { makeMaterial } from "../game/material-helpers";
import { FinishedProduct, ToolItem } from "../game/Materials";
import {
  GLYPH_HIT_INCHES,
  machineUnderPoint,
  materialHitExtentInches,
  pickUnderCursor,
  pileUnderPoint,
} from "./floor-picking";

/** An 8-footer lying where it was dropped, square to the shop. */
function boardPile(position: [number, number], rotation = 0): MaterialPile {
  return { material: board("walnut", 96, 6, 4), position, rotation };
}

/** A table saw with its front-left cell at the given spot. */
function sawAt(position: [number, number]): Machine {
  return new Machine({
    ...freshMachineState("jobsiteTableSaw", initialGameState.progression),
    position,
  });
}

describe("materialHitExtentInches", () => {
  it("measures a board across its width and along its length", () => {
    const extent = materialHitExtentInches(board("walnut", 96, 6, 4));
    assert.deepStrictEqual(extent, { across: 6, along: 96 });
  });

  it("takes a finished product's size from its blueprint", () => {
    const shelf = makeMaterial<FinishedProduct>({
      type: "rusticShelf",
      species: "pine",
    });
    const extent = materialHitExtentInches(shelf);
    assert.ok(extent.across > GLYPH_HIT_INCHES);
    assert.ok(extent.along > 0);
  });

  it("gives a piece that draws as a glyph a square foot", () => {
    const tool = makeMaterial<ToolItem>({ type: "tool", toolId: "handSaw" });
    assert.deepStrictEqual(materialHitExtentInches(tool), {
      across: GLYPH_HIT_INCHES,
      along: GLYPH_HIT_INCHES,
    });
  });
});

describe("pileUnderPoint", () => {
  it("hits a long board anywhere along its length", () => {
    const pile = boardPile([5, 5]);
    assert.ok(pileUnderPoint(pile, [5, 5]));
    assert.ok(pileUnderPoint(pile, [5, 8.5]));
    assert.ok(pileUnderPoint(pile, [5, 1.5]));
  });

  it("misses past the ends and off the edges", () => {
    const pile = boardPile([5, 5]);
    assert.ok(!pileUnderPoint(pile, [5, 9.5]));
    assert.ok(!pileUnderPoint(pile, [5.5, 5]));
  });

  it("follows the rotation the piece was dropped at", () => {
    const turned = boardPile([5, 5], Math.PI / 2);
    assert.ok(pileUnderPoint(turned, [8.5, 5]));
    assert.ok(!pileUnderPoint(turned, [5, 8.5]));
  });

  it("keeps a glyph-sized piece comfortable to point at", () => {
    const tool = makeMaterial<ToolItem>({ type: "tool", toolId: "handSaw" });
    const pile: MaterialPile = {
      material: tool,
      position: [5, 5],
      rotation: 0,
    };
    assert.ok(pileUnderPoint(pile, [5.4, 5.4]));
    assert.ok(!pileUnderPoint(pile, [5.6, 5]));
  });
});

describe("pickUnderCursor", () => {
  it("takes the stock lying across a machine over the machine", () => {
    const saw = sawAt([6, 8]);
    const pile = boardPile([6.5, 8.5]);
    assert.ok(machineUnderPoint(saw, [6.5, 8.5]));

    const pick = pickUnderCursor([6.5, 8.5], [pile], [saw]);
    assert.strictEqual(pick?.kind, "pile");
    assert.strictEqual(pick.pile, pile);
  });

  it("lets the machine answer where the stock isn't", () => {
    const saw = sawAt([6, 8]);
    const pile = boardPile([6.5, 8.5]);

    const pick = pickUnderCursor([6.9, 8.5], [pile], [saw]);
    assert.strictEqual(pick?.kind, "machine");
    assert.strictEqual(pick.machine, saw);
  });

  it("lets the machine answer for stock that isn't on offer", () => {
    const saw = sawAt([6, 8]);
    const pick = pickUnderCursor([6.5, 8.5], [], [saw]);
    assert.strictEqual(pick?.kind, "machine");
  });

  it("takes the first of a stack, which is the piece on top", () => {
    const under = boardPile([6.5, 8.5]);
    const onTop = boardPile([6.5, 8.5]);
    const pick = pickUnderCursor([6.5, 8.5], [onTop, under], []);
    assert.strictEqual(pick?.kind, "pile");
    assert.strictEqual(pick.pile, onTop);
  });

  it("finds nothing on bare floor", () => {
    const saw = sawAt([6, 8]);
    assert.strictEqual(pickUnderCursor([0.5, 0.5], [], [saw]), null);
  });
});
