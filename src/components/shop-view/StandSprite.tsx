import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import { MaterialInstance } from "../../game/Materials";
import { standRect } from "../../game/stand";
import { useGameState } from "../useGameState";
import { MaterialSprite } from "../material-sprites/MaterialSprite";
import { cellToPixel } from "./shop-scale";
import {
  TARGET_HIGHLIGHT_FILTERS,
  TUTORIAL_HIGHLIGHT_FILTERS,
} from "./targetHighlight";

/**
 * The for-sale stand: a plank table in the grass at the street end of
 * the lot, with a hand-written sign leaning beside it. Where it sits —
 * and the solid the walking body bounces off — comes from standRect in
 * stand.ts; this component only draws onto that footprint. Procedural on
 * purpose for now (see docs/asset-backlog.md).
 */

const TABLETOP = 0x8a6f4d;
const TABLETOP_EDGE = 0x6d5639;
const PLANK_GAP = 0x77603f;
const SIGN_BOARD = 0xe8e0cd;
const SIGN_POST = 0x5c4a30;
const SIGN_INK = 0x2b2620;

export const StandSprite: React.FC<{
  /** The table lights up when F would set work out on it. */
  highlight?: boolean;
  /** The piece E would take back, outlined the way a floor pile is.
   * Matched by identity against `gameState.stand`. */
  highlightedItem?: MaterialInstance;
  /** The guided opening pointing the player here, in tutorial orange. */
  tutorialHighlight?: boolean;
}> = ({ highlight, highlightedItem, tutorialHighlight }) => {
  const gameState = useGameState();
  const rect = standRect(gameState.shopInfo);
  const left = cellToPixel(rect.min[0]);
  const top = cellToPixel(rect.min[1]);
  const width = cellToPixel(rect.max[0] - rect.min[0]);
  const height = cellToPixel(rect.max[1] - rect.min[1]);

  const drawTable = useCallback(
    (g: Graphics) => {
      g.clear();
      // The tabletop, edge band first so the planks read as sitting on it
      g.rect(0, 0, width, height);
      g.fill(TABLETOP_EDGE);
      g.rect(2, 2, width - 4, height - 4);
      g.fill(TABLETOP);
      // Plank seams across the top
      const planks = 4;
      for (let i = 1; i < planks; i++) {
        g.rect(2, (height / planks) * i, width - 4, 1.5);
      }
      g.fill(PLANK_GAP);
    },
    [width, height],
  );

  const drawSign = useCallback((g: Graphics) => {
    g.clear();
    // A stake with a board nailed across it, planted street-side of the
    // table. Drawn in local coordinates; the container places it.
    g.rect(-1.5, 0, 3, 14);
    g.fill(SIGN_POST);
    g.rect(-16, -14, 32, 18);
    g.fill(SIGN_BOARD);
    g.rect(-16, -14, 32, 18);
    g.stroke({ width: 1, color: SIGN_POST });
  }, []);

  return (
    <pixiContainer x={left} y={top}>
      <pixiGraphics
        draw={drawTable}
        filters={
          highlight
            ? TARGET_HIGHLIGHT_FILTERS
            : tutorialHighlight
              ? TUTORIAL_HIGHLIGHT_FILTERS
              : undefined
        }
      />
      {/* What's out for sale, fanned across the tabletop like the truck's
          bed cargo — newest lands on top, matching what E takes back */}
      {gameState.stand.map((material, i) => (
        <pixiContainer
          key={`stand-${material.id ?? i}`}
          x={width / 2 + (i % 2 === 0 ? -3 : 3)}
          y={height / 2 + ((i % 3) - 1) * 12}
          // Lengthwise down the tall table, at merchandise size so
          // pieces read as sitting on it rather than swallowing it
          angle={((i * 11) % 25) - 12}
          scale={0.55}
          filters={
            material === highlightedItem ? TARGET_HIGHLIGHT_FILTERS : undefined
          }
        >
          <MaterialSprite material={material} />
        </pixiContainer>
      ))}
      {/* The sign, planted in the grass at the table's street end */}
      <pixiContainer x={width / 2} y={height + 20}>
        <pixiGraphics draw={drawSign} />
        <pixiText
          text={"FOR\nSALE"}
          x={0}
          y={-5}
          anchor={0.5}
          resolution={4}
          style={{
            fontFamily: "Shantell Notes",
            fontWeight: "700",
            fontSize: 7,
            lineHeight: 7,
            align: "center",
            fill: SIGN_INK,
          }}
        />
      </pixiContainer>
    </pixiContainer>
  );
};
