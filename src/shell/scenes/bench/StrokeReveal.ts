import { Container, Graphics, Renderer, RenderTexture, Sprite } from "pixi.js";
import { BenchPlacement } from "../../../game/bench-work/bench-layout";
import { WorkSurfaceSize } from "../../../game/bench-work/workpiece";
import { Board, MaterialInstance } from "../../../game/Materials";
import { drawBoardEdgeBand } from "../../../views/material-sprites/board";
import { createMaterialSprite } from "../../../views/material-sprites/MaterialSprite";
import { StageFit } from "./stageMath";

/**
 * The scratch-off under stroke work: the workpiece drawn where it lies
 * with its two surface states stacked — how it is now, and how the pass
 * leaves it — the finished one showing only through a PIXI
 * `RenderTexture` the brush stamps into as strokes land. Planed and
 * sanded wood appears under the tool, stroke by stroke, exactly where it
 * passed. One draw call per stamp, never read back from the GPU;
 * completion is the CPU-side grid's call (bench-work/coverage.ts),
 * bumped analytically by the same strokes.
 *
 * Face work stacks the piece's own material sprites; edge work stacks
 * the narrow band the block plane rides (`drawBoardEdgeBand`), so the
 * strip under the tool is drawn edge-on rather than as a face.
 *
 * The view drives this: it says where the piece lies and where the hand
 * went, and this draws. Everything here is ephemeral (decision 3) —
 * standing up ends the pass and the next one starts from bare wood.
 */

/**
 * The one scratch texture every pass reveals through, resized per
 * workpiece and NEVER destroyed: destroying a texture that has served as
 * a sprite mask leaves the mask pipe's pooled bind groups pointing at
 * freed GPU state (pixi v8), and the next masked surface crashes the
 * renderer. Only one stroke pass runs at a time, so one texture serves
 * them all; each pass wipes it as it starts.
 */
let scratchTexture: RenderTexture | null = null;
function scratchTextureFor(widthPx: number, heightPx: number): RenderTexture {
  if (!scratchTexture) {
    scratchTexture = RenderTexture.create({ width: widthPx, height: heightPx });
  } else {
    scratchTexture.resize(widthPx, heightPx);
  }
  return scratchTexture;
}

/** An empty container rendered with clear: true — the wipe. */
const SCRATCH_WIPE = new Container();

/** The piece a pass is working, and where it lies on the stage. */
export interface RevealTarget {
  /** The piece as it is now, and as the finished pass leaves it. */
  readonly material: MaterialInstance;
  readonly finished: MaterialInstance | null;
  readonly placement: BenchPlacement;
  readonly size: WorkSurfaceSize;
  /** Where the strokes land: the face, or the narrow edge band. */
  readonly band: "face" | "edge";
  readonly fit: StageFit;
}

export class StrokeReveal {
  /** Mounted on the dive's frame, so the lean-in carries it. */
  readonly root = new Container();
  /** The finished state, showing only where the brush has been. */
  private revealed = new Container();
  private beforeScale = new Container();
  private afterScale = new Container();
  private maskSprite: Sprite | null = null;
  private brush: Graphics | null = null;
  private brushKey = "";
  /** The piece and size the stack was built for. */
  private builtFor: string | null = null;
  private pxPerIn = 1;

  constructor() {
    this.revealed.addChild(this.afterScale);
    this.root.addChild(this.beforeScale, this.revealed);
    this.root.visible = false;
  }

  /**
   * Draw the piece at its placement, building the stack the first time
   * (and whenever a different piece, band, or zoom comes under the
   * tool — a rebuild starts from bare wood).
   */
  show(target: RevealTarget, renderer: Renderer): void {
    const { fit, placement, size } = target;
    const widthPx = Math.max(2, Math.round(size.widthIn * fit.pxPerIn));
    const heightPx = Math.max(2, Math.round(size.heightIn * fit.pxPerIn));
    const key = [
      target.material.id,
      target.finished?.id ?? "",
      target.band,
      widthPx,
      heightPx,
    ].join("|");
    if (key !== this.builtFor) {
      this.build(target, widthPx, heightPx, renderer);
      this.builtFor = key;
    }
    this.pxPerIn = fit.pxPerIn;
    this.root.visible = true;
    this.root.position.set(
      fit.originX + placement.xIn * fit.pxPerIn,
      fit.originY + placement.yIn * fit.pxPerIn,
    );
    this.root.angle = placement.angleDeg;
    this.root.scale.set(placement.flipped ? -1 : 1, 1);
    this.beforeScale.scale.set(fit.spriteScale);
    this.afterScale.scale.set(fit.spriteScale);
  }

  /** Nothing under the tool: put the stack away. */
  hide(): void {
    if (this.builtFor === null) return;
    this.root.visible = false;
    this.clear();
  }

  /**
   * The hand went from one point to another across the piece (workpiece
   * inches): stamp the brush along the segment, at sub-radius spacing so
   * a fast drag doesn't skip. A resting powered pad passes the same
   * point twice.
   */
  stamp(
    renderer: Renderer,
    x0In: number,
    y0In: number,
    x1In: number,
    y1In: number,
    radiusIn: number,
  ): void {
    if (this.builtFor === null || !scratchTexture) return;
    const brush = this.brushFor(radiusIn);
    const distance = Math.hypot(x1In - x0In, y1In - y0In);
    const spacing = Math.max(radiusIn / 2, 0.05);
    const steps = Math.max(1, Math.ceil(distance / spacing));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      brush.position.set(
        (x0In + (x1In - x0In) * t) * this.pxPerIn,
        (y0In + (y1In - y0In) * t) * this.pxPerIn,
      );
      renderer.render({
        container: brush,
        target: scratchTexture,
        clear: false,
      });
    }
  }

  destroy(): void {
    this.clear();
    this.root.destroy({ children: true });
  }

  /** The two stacked states, the mask between them, and a bare scratch. */
  private build(
    target: RevealTarget,
    widthPx: number,
    heightPx: number,
    renderer: Renderer,
  ): void {
    this.clear();
    const { material, finished, placement, band } = target;
    this.beforeScale.addChild(surfaceSprite(material, band, placement, false));
    if (finished) {
      this.afterScale.addChild(surfaceSprite(finished, band, placement, true));
    }
    const texture = scratchTextureFor(widthPx, heightPx);
    // A fresh pass starts from an empty scratch — the texture outlives
    // every pass (see scratchTextureFor), so wipe it here.
    renderer.render({ container: SCRATCH_WIPE, target: texture, clear: true });
    const mask = new Sprite(texture);
    mask.position.set(-widthPx / 2, -heightPx / 2);
    this.root.addChild(mask);
    this.maskSprite = mask;
    this.revealed.mask = mask;
  }

  /** Tear the stack down without touching the shared scratch texture. */
  private clear(): void {
    this.revealed.mask = null;
    this.maskSprite?.destroy();
    this.maskSprite = null;
    for (const holder of [this.beforeScale, this.afterScale]) {
      holder.removeChildren().forEach((child) => child.destroy());
    }
    this.brush?.destroy();
    this.brush = null;
    this.brushKey = "";
    this.builtFor = null;
  }

  /** The soft brush stamped into the scratch: full core, feathered rim. */
  private brushFor(radiusIn: number): Graphics {
    const key = `${radiusIn}|${this.pxPerIn}`;
    if (this.brush && key === this.brushKey) return this.brush;
    this.brush?.destroy();
    const g = new Graphics();
    const r = Math.max(radiusIn * this.pxPerIn, 3);
    g.circle(0, 0, r).fill({ color: 0xffffff, alpha: 0.55 });
    g.circle(0, 0, r * 0.66).fill({ color: 0xffffff, alpha: 0.8 });
    g.circle(0, 0, r * 0.4).fill({ color: 0xffffff, alpha: 1 });
    this.brush = g;
    this.brushKey = key;
    return g;
  }
}

/**
 * The surface the strokes land on: the piece's face as it lies, or the
 * narrow edge band the block plane rides. `finished` is which of the two
 * stacked states this is — the band shows the grain the plane brings up
 * only on the upper one.
 */
function surfaceSprite(
  material: MaterialInstance,
  band: "face" | "edge",
  placement: BenchPlacement,
  finished: boolean,
): Container {
  if (band === "edge" && material.type === "board") {
    const g = new Graphics();
    drawBoardEdgeBand(g, material as Board, finished, material.id);
    return g;
  }
  return createMaterialSprite(material, {
    onEdge: placement.onEdge,
    onEnd: placement.onEnd,
  });
}
