import { Graphics } from "pixi.js";
import { PIXELS_PER_INCH } from "../shop-scale";
import { defaultBoardFace, EndGrainSlice, Panel } from "../../game/Materials";
import {
  edgeFill,
  endFill,
  faceFill,
  TURNED_AWAY_SHADE,
  woodArt,
} from "./woodFills";

/** The panel data the renderer reads — everything but identity. */
export type PanelLook = Omit<Panel, "id" | "type">;

/**
 * A glued-up panel: one strip per board the player edge-glued, each a
 * window onto its own species' scans, so a multi-species pattern reads
 * as the actual woods rather than as stripes of color. An end-grain
 * panel is crosscut slices stood back up, so its strips are laid out as
 * a brick of sawn ends instead. The old PanelSprite as a plain function;
 * `seed` is the stable identity for the strips' grain (the material id).
 */
export function drawPanel(g: Graphics, panel: PanelLook, seed?: string): void {
  const { strips, length, thickness, grain } = panel;

  g.clear();
  const totalWidth =
    strips.reduce((sum, strip) => sum + strip.width, 0) * PIXELS_PER_INCH;
  const height = length * PIXELS_PER_INCH;
  const depth = (thickness * PIXELS_PER_INCH) / 4;
  const panelSeed = seed ?? `panel-${strips.length}x${length}`;

  // shadow
  for (const shadowWidth of [1, 2]) {
    g.rect(
      -totalWidth / 2 - shadowWidth,
      -height / 2 - shadowWidth,
      totalWidth + depth + shadowWidth * 2,
      height + shadowWidth * 2,
    );
    g.fill({ color: 0x000000, alpha: 0.1 });
  }

  // strips, left to right in list order
  let x = -totalWidth / 2;
  let stripIndex = 0;
  let lastArt = undefined;
  let lastRegion = undefined;
  for (const strip of strips) {
    const stripWidth = strip.width * PIXELS_PER_INCH;
    const stripSeed = `${panelSeed}/strip-${stripIndex}`;
    const region = defaultBoardFace(stripSeed, length, strip.width);
    const art = woodArt(strip.species, region.seed, thickness);
    lastArt = art;
    lastRegion = region;

    if (grain === "end") {
      // Crosscut slices stood on end and glued: a brick of sawn
      // faces, offset row to row the way the slices were stacked
      const block = 2 * PIXELS_PER_INCH;
      const offset = stripIndex % 2 === 0 ? 0 : block / 2;
      let row = 0;
      for (let y = -height / 2 - offset; y < height / 2; y += block) {
        const top = Math.max(y, -height / 2);
        const bottom = Math.min(y + block, height / 2);
        g.rect(x, top, stripWidth, bottom - top);
        g.fill(
          endFill(
            art,
            `${stripSeed}/block-${row}`,
            strip.width,
            block / PIXELS_PER_INCH,
            x,
            top,
          ),
        );
        // the glue line between slices
        g.rect(x, bottom - 0.5, stripWidth, 0.5);
        g.fill({ color: 0x000000, alpha: 0.25 });
        row++;
      }
      // End grain sits darker than the long-grain faces around it
      g.rect(x, -height / 2, stripWidth, height);
      g.fill(TURNED_AWAY_SHADE);
    } else {
      g.rect(x, -height / 2, stripWidth, height);
      g.fill(faceFill(art, region, x, -height / 2));
    }

    // the glue seam against the next strip
    if (stripIndex < strips.length - 1) {
      g.rect(x + stripWidth - 0.5, -height / 2, 0.5, height);
      g.fill({ color: 0x000000, alpha: 0.18 });
    }
    x += stripWidth;
    stripIndex++;
  }

  // edge, taken from the last strip — the board that ended up there
  if (lastArt !== undefined && lastRegion !== undefined) {
    const lastStrip = strips[strips.length - 1];
    g.rect(totalWidth / 2, -height / 2, depth, height);
    g.fill(
      edgeFill(
        lastArt,
        lastRegion,
        lastStrip.width,
        thickness,
        totalWidth / 2,
        -height / 2,
      ),
    );
    g.rect(totalWidth / 2, -height / 2, depth, height);
    g.fill(TURNED_AWAY_SHADE);
  }
}

/**
 * One crosscut slice of a panel: a narrow stick showing the source strip
 * pattern in the real woods, waiting to be stood on end and glued into
 * an end-grain panel. The cut end it will be glued by caps one end. The
 * old EndGrainSliceSprite as a plain function.
 */
export function drawEndGrainSlice(
  g: Graphics,
  slice: EndGrainSlice,
  seed?: string,
): void {
  const { strips, thickness } = slice;

  g.clear();
  const totalWidth =
    strips.reduce((sum, strip) => sum + strip.width, 0) * PIXELS_PER_INCH;
  const heightIn = 2;
  const height = heightIn * PIXELS_PER_INCH;
  const sliceSeed = seed ?? `slice-${strips.length}`;

  // shadow
  g.rect(-totalWidth / 2 - 1, -height / 2 - 1, totalWidth + 2, height + 2);
  g.fill({ color: 0x000000, alpha: 0.1 });

  // pattern segments, left to right
  let x = -totalWidth / 2;
  let stripIndex = 0;
  let lastArt = undefined;
  for (const strip of strips) {
    const stripWidth = strip.width * PIXELS_PER_INCH;
    const stripSeed = `${sliceSeed}/strip-${stripIndex}`;
    const region = defaultBoardFace(stripSeed, heightIn, strip.width);
    const art = woodArt(strip.species, region.seed, thickness);
    lastArt = art;
    g.rect(x, -height / 2, stripWidth, height);
    g.fill(faceFill(art, region, x, -height / 2));
    x += stripWidth;
    stripIndex++;
  }

  // end-grain face: the glue face, capping one end
  if (lastArt !== undefined) {
    const capWidth = 2;
    g.rect(totalWidth / 2, -height / 2, capWidth, height);
    g.fill(
      endFill(
        lastArt,
        `${sliceSeed}/cap`,
        capWidth / PIXELS_PER_INCH,
        heightIn,
        totalWidth / 2,
        -height / 2,
      ),
    );
    g.rect(totalWidth / 2, -height / 2, capWidth, height);
    g.fill(TURNED_AWAY_SHADE);
  }
}
