import { Graphics } from "pixi.js";
import { colorBySpecies } from "../colorBySpecies";
import { PIXELS_PER_INCH } from "../shop-scale";
import { EndGrainSlice, Panel } from "../../game/Materials";

/** The panel data the renderer reads — everything but identity. */
export type PanelLook = Omit<Panel, "id" | "type">;

/**
 * A glued-up panel: one rect per strip, colored by that strip's species, so
 * multi-species patterns render as actual stripes. The old PanelSprite's
 * draw callback as a plain function.
 */
export function drawPanel(g: Graphics, panel: PanelLook): void {
  const { strips, length, thickness, grain } = panel;

  g.clear();
  const totalWidth =
    strips.reduce((sum, strip) => sum + strip.width, 0) * PIXELS_PER_INCH;
  const height = length * PIXELS_PER_INCH;
  const depth = (thickness * PIXELS_PER_INCH) / 4;

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
  for (const strip of strips) {
    const stripWidth = strip.width * PIXELS_PER_INCH;
    g.rect(x, -height / 2, stripWidth, height);
    g.fill(colorBySpecies[strip.species].primary);
    // End-grain panels show as glued blocks: cross-lines, offset per
    // column, suggesting the brick pattern of standing slices
    if (grain === "end") {
      const block = 2 * PIXELS_PER_INCH;
      const offset = stripIndex % 2 === 0 ? 0 : block / 2;
      for (let y = -height / 2 + offset; y < height / 2; y += block) {
        g.rect(x, y, stripWidth, 1);
        g.fill({
          color: colorBySpecies[strip.species].secondary,
          alpha: 0.6,
        });
      }
    }
    x += stripWidth;
    stripIndex++;
  }

  // edge, colored by the last strip
  const lastSpecies = strips[strips.length - 1]?.species ?? "pine";
  g.rect(totalWidth / 2, -height / 2, depth, height);
  g.fill(colorBySpecies[lastSpecies].secondary);
}

/**
 * One crosscut slice of a panel: a narrow stick showing the source strip
 * pattern, waiting to be stood on end and glued into an end-grain panel.
 * The old EndGrainSliceSprite's draw callback as a plain function.
 */
export function drawEndGrainSlice(g: Graphics, slice: EndGrainSlice): void {
  const { strips } = slice;

  g.clear();
  const totalWidth =
    strips.reduce((sum, strip) => sum + strip.width, 0) * PIXELS_PER_INCH;
  const height = 2 * PIXELS_PER_INCH;

  // shadow
  g.rect(-totalWidth / 2 - 1, -height / 2 - 1, totalWidth + 2, height + 2);
  g.fill({ color: 0x000000, alpha: 0.1 });

  // pattern segments, left to right
  let x = -totalWidth / 2;
  for (const strip of strips) {
    const stripWidth = strip.width * PIXELS_PER_INCH;
    g.rect(x, -height / 2, stripWidth, height);
    g.fill(colorBySpecies[strip.species].primary);
    x += stripWidth;
  }

  // end-grain face: darker cap on one end
  g.rect(totalWidth / 2, -height / 2, 2, height);
  g.fill(colorBySpecies[strips[strips.length - 1].species].secondary);
}
