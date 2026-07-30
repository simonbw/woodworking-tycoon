import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import { CellMap } from "../../game/CellMap";
import { FeedRunRuler, feedRunRulers } from "../../game/feed-clearance";
import { Machine } from "../../game/Machine";
import { Vector } from "../../game/Vectors";
import { PIXELS_PER_CELL } from "./shop-scale";

/**
 * Further than any lane in the shop can run — the rulers measure what's
 * really there, and the walls are what stop them.
 */
const RULER_CAP = 30;

/** T-cap half-height, line-to-label gap, and type size, in world px. */
const TICK = PIXELS_PER_CELL * 0.18;
const LABEL_OFFSET = PIXELS_PER_CELL * 0.3;
const FONT_SIZE = 15;

const CHALK = 0xf5f0e8;
const SHADOW = 0x1a1a1a;

interface SideGeometry {
  start: Vector;
  end: Vector;
  perp: Vector;
  label: Vector;
  run: number;
}

/**
 * Where one side's dimension line sits, in world pixels: from the
 * footprint's edge out to the end of the clear run, along the middle of
 * the lane, with the label off to a consistent side (above a horizontal
 * lane, left of a vertical one).
 */
function sideGeometry(side: FeedRunRuler): SideGeometry {
  const [dx, dy] = side.direction;
  const start: Vector = [
    (side.edgeCell[0] + 0.5 + dx * 0.5) * PIXELS_PER_CELL,
    (side.edgeCell[1] + 0.5 + dy * 0.5) * PIXELS_PER_CELL,
  ];
  const end: Vector = [
    start[0] + dx * side.run * PIXELS_PER_CELL,
    start[1] + dy * side.run * PIXELS_PER_CELL,
  ];
  let perp: Vector = [-dy, dx];
  if (perp[1] > 0 || (perp[1] === 0 && perp[0] > 0)) {
    perp = [-perp[0], -perp[1]];
  }
  const label: Vector = [
    (start[0] + end[0]) / 2 + perp[0] * LABEL_OFFSET,
    (start[1] + end[1]) / 2 + perp[1] * LABEL_OFFSET,
  ];
  return { start, end, perp, label, run: side.run };
}

/**
 * Chalk dimension lines along a feed-through machine's lane: how many
 * feet of clear run each side has, drawn as a measurement line with
 * T-ends and the footage at its middle. Rendered against the set-down
 * ghost while the player carries the machine, so a spot can be judged
 * before the machine lands — a side with no run at all keeps just its
 * end tick and a 0'.
 */
export const FeedRunRulerLayer: React.FC<{
  machine: Machine;
  cellMap: CellMap;
}> = ({ machine, cellMap }) => {
  const rulers = feedRunRulers(machine, cellMap, RULER_CAP);

  const draw = useCallback(
    (g: Graphics) => {
      g.clear();
      if (!rulers) {
        return;
      }
      for (const side of [rulers.infeed, rulers.outfeed]) {
        const { start, end, perp } = sideGeometry(side);
        const segments: Array<[Vector, Vector]> = [
          [start, end],
          [
            [start[0] - perp[0] * TICK, start[1] - perp[1] * TICK],
            [start[0] + perp[0] * TICK, start[1] + perp[1] * TICK],
          ],
          [
            [end[0] - perp[0] * TICK, end[1] - perp[1] * TICK],
            [end[0] + perp[0] * TICK, end[1] + perp[1] * TICK],
          ],
        ];
        // Twice over: a soft dark underlay so the chalk reads on a pale
        // slab, then the chalk line itself
        for (const [width, color, alpha] of [
          [4, SHADOW, 0.3],
          [1.5, CHALK, 0.9],
        ] as const) {
          for (const [from, to] of segments) {
            g.moveTo(from[0], from[1]);
            g.lineTo(to[0], to[1]);
          }
          g.stroke({ width, color, alpha, cap: "round" });
        }
      }
    },
    [rulers],
  );

  if (!rulers) {
    return null;
  }

  return (
    <pixiContainer eventMode="none">
      <pixiGraphics draw={draw} />
      {[rulers.infeed, rulers.outfeed].map((side, i) => {
        const { label, run } = sideGeometry(side);
        return (
          <pixiText
            key={i === 0 ? "infeed" : "outfeed"}
            text={`${run}'`}
            x={label[0]}
            y={label[1]}
            anchor={0.5}
            resolution={4}
            style={{
              fontFamily: "Barlow Condensed",
              fontWeight: "600",
              fontSize: FONT_SIZE,
              fill: CHALK,
              stroke: { color: SHADOW, width: 2.5 },
            }}
          />
        );
      })}
    </pixiContainer>
  );
};
