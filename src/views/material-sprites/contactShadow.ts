import { FillGradient, Graphics } from "pixi.js";

/**
 * The shadow a piece throws on the surface under it — ambient
 * occlusion, one rule: height above the surface decides everything.
 * Every inch a piece stands off the table buys SHADOW_PX_PER_STAND_INCH
 * of rim, evenly all around; the same height lightens the shadow (a
 * riser blocks a shrinking share of the light dome) and IS the softness
 * — the penumbra spans the whole spread, so a piece near contact casts
 * a tight dark line and a tall one a wide pale pool. A 2x4 flat, on
 * edge, and on end wear three distinct shadows; picking a piece up
 * adds the carry's inches on top.
 *
 * The stand height is capped so a very tall piece (a board on end)
 * darkens a generous rim rather than half the bench; the carried lift
 * adds past the cap, so lifting always visibly spreads the pool.
 *
 * The penumbra is a real gradient, not a blur filter and not stacked
 * rings (both were tried: filters cost a render pass per shadow across
 * a floor of piles, rings band): a solid core with four linear-fade
 * strips along the sides and four radial-fade squares on the corners,
 * all sharing eight constant gradient fills. Darkness rides the
 * Graphics' own alpha, so the fills never rebuild. Every material's
 * stand height lives in materialShadow.ts; pieces built from parts
 * cast one shadow for the whole piece there.
 */

/** How much rim one inch of stand height buys. */
export const SHADOW_PX_PER_STAND_INCH = 1.5;

/** Stand height past which the resting rim stops growing. */
const SHADOW_STAND_CAP_IN = 6;

/** Darkness at contact; height fades it (see drawContactShadow). */
const CONTACT_ALPHA = 0.26;

/** Inches of height that cost the shadow half its contact darkness. */
const ALPHA_FADE_HEIGHT_IN = 6;

/** The penumbra's profile: full against the core, easing to nothing at
 * the rim — a quasi-gaussian falloff. */
const FADE_STOPS: ReadonlyArray<[number, number]> = [
  [0, 1],
  [0.5, 0.55],
  [0.8, 0.2],
  [1, 0],
];

interface FadeFills {
  readonly up: FillGradient;
  readonly down: FillGradient;
  readonly left: FillGradient;
  readonly right: FillGradient;
  readonly tl: FillGradient;
  readonly tr: FillGradient;
  readonly bl: FillGradient;
  readonly br: FillGradient;
}

/** The eight shared fills — normalized to each filled shape's own
 * bounds ("local" texture space), so one set serves every shadow at
 * every size. */
let fills: FadeFills | null = null;

function fadeFills(): FadeFills {
  if (fills) return fills;
  const stops = (gradient: FillGradient): FillGradient => {
    for (const [offset, alpha] of FADE_STOPS) {
      gradient.addColorStop(offset, `rgba(0,0,0,${alpha})`);
    }
    return gradient;
  };
  const linear = (
    start: { x: number; y: number },
    end: { x: number; y: number },
  ) =>
    stops(
      new FillGradient({ type: "linear", start, end, textureSpace: "local" }),
    );
  const radial = (center: { x: number; y: number }) =>
    stops(
      new FillGradient({
        type: "radial",
        center,
        innerRadius: 0,
        outerCenter: center,
        outerRadius: 1,
        textureSpace: "local",
      }),
    );
  fills = {
    up: linear({ x: 0, y: 1 }, { x: 0, y: 0 }),
    down: linear({ x: 0, y: 0 }, { x: 0, y: 1 }),
    left: linear({ x: 1, y: 0 }, { x: 0, y: 0 }),
    right: linear({ x: 0, y: 0 }, { x: 1, y: 0 }),
    tl: radial({ x: 1, y: 1 }),
    tr: radial({ x: 0, y: 1 }),
    bl: radial({ x: 1, y: 0 }),
    br: radial({ x: 0, y: 0 }),
  };
  return fills;
}

export function drawContactShadow(
  g: Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  standInches: number,
  options: {
    /** Inches the piece is held off the surface (the carried lift),
     * spreading and fading the pool past the resting cap. */
    liftInches?: number;
  } = {},
): void {
  const { liftInches = 0 } = options;
  const heightIn = Math.min(standInches, SHADOW_STAND_CAP_IN) + liftInches;
  const s = heightIn * SHADOW_PX_PER_STAND_INCH;
  // Darkness lives on the Graphics, not in the fills, so the shared
  // gradients serve every height.
  g.alpha = CONTACT_ALPHA / (1 + heightIn / ALPHA_FADE_HEIGHT_IN);
  const fade = fadeFills();
  g.rect(x, y, width, height).fill(0x000000);
  g.rect(x, y - s, width, s).fill(fade.up);
  g.rect(x, y + height, width, s).fill(fade.down);
  g.rect(x - s, y, s, height).fill(fade.left);
  g.rect(x + width, y, s, height).fill(fade.right);
  g.rect(x - s, y - s, s, s).fill(fade.tl);
  g.rect(x + width, y - s, s, s).fill(fade.tr);
  g.rect(x - s, y + height, s, s).fill(fade.bl);
  g.rect(x + width, y + height, s, s).fill(fade.br);
}
