import { Container, Graphics } from "pixi.js";
import { Persistence } from "../../../config/constants";
import { BaseEntity } from "../../../core/entity/BaseEntity";
import { Entity } from "../../../core/entity/Entity";
import { GameSprite } from "../../../core/entity/GameSprite";
import { on } from "../../../core/entity/handler";
import { groupPieces } from "../../../game/bench-work/bench-group";
import { placedPieceSize } from "../../../game/bench-work/workpiece";
import { createMaterialSprite } from "../../../views/material-sprites/MaterialSprite";
import { ShellStore } from "../../ShellStore";
import { BenchDive } from "./BenchDive";
import { benchStage } from "./benchStage";

/**
 * The zoomed look at the bench — phase 7's scene skeleton, drawn on the
 * screen-space "hud" layer over the still-ticking world. The pure
 * engine does the thinking: `benchStage` frames the bench run and maps
 * its inches onto the screen, `groupPieces` says what lies where. This
 * view draws the backdrop, the run's tops, and every piece with the
 * shop's own material sprites; the gesture surfaces (tools, nails,
 * strokes) build on it mode by mode.
 */

const BACKDROP = 0x14110d;
const BENCH_WOOD = 0x8a6d47;
const BENCH_EDGE = 0x6b5334;

export class BenchDiveView extends BaseEntity implements Entity {
  persistenceLevel: number = Persistence.Permanent;
  pausable = false;

  private root: Container & GameSprite;
  private backdrop = new Graphics();
  private tops = new Graphics();
  private pieces = new Container();

  private drawnKey: string | null = null;

  /**
   * Where every piece on the bench sits on screen right now — the same
   * seam the old shell gave the store's specs (`__STORE_LAYOUT__`): a
   * test drives the bench by pointing at real pieces rather than
   * guessing at pixels.
   */
  piecePoints(): ReadonlyArray<{
    id: string;
    x: number;
    y: number;
    widthIn: number;
    heightIn: number;
  }> {
    const stage = benchStage(this.game);
    if (!stage) return [];
    const { fit, group } = stage;
    return groupPieces(group).map((piece) => {
      const size = placedPieceSize(piece.material, piece.placement);
      return {
        id: piece.material.id,
        x: fit.originX + piece.placement.xIn * fit.pxPerIn,
        y: fit.originY + piece.placement.yIn * fit.pxPerIn,
        widthIn: size.widthIn,
        heightIn: size.heightIn,
      };
    });
  }

  constructor() {
    super();
    this.root = new Container() as Container & GameSprite;
    this.root.layerName = "hud";
    this.root.visible = false;
    this.root.addChild(this.backdrop, this.tops, this.pieces);
    this.sprite = this.root;
  }

  @on("render")
  onRender() {
    const game = this.game;
    const renderer = game.renderer;
    const dive = game.entities.tryGetSingleton(BenchDive);
    const stage = benchStage(game);
    if (!renderer || !dive || !stage) {
      this.root.visible = false;
      this.drawnKey = null;
      return;
    }
    this.root.visible = true;
    const { fit, group } = stage;

    // Redraw when the sim moved or a different bench opened; the fit
    // also follows the window (cheap to recompute, compared each frame).
    const store = game.entities.tryGetSingleton(ShellStore);
    const fitKey = `${fit.pxPerIn},${fit.originX},${fit.originY}`;
    const key = `${dive.openBenchKey}|${store?.version ?? 0}|${fitKey}`;
    if (key === this.drawnKey) return;
    this.drawnKey = key;

    // The backdrop: the shop dimmed to the bench's pool of light.
    this.backdrop.clear();
    this.backdrop
      .rect(0, 0, renderer.getWidth(), renderer.getHeight())
      .fill({ color: BACKDROP, alpha: 0.86 });

    // The run's tops, in frame inches.
    this.tops.clear();
    for (const member of group.members) {
      const x = fit.originX + member.rect.xIn * fit.pxPerIn;
      const y = fit.originY + member.rect.yIn * fit.pxPerIn;
      const w = member.rect.widthIn * fit.pxPerIn;
      const h = member.rect.heightIn * fit.pxPerIn;
      this.tops.rect(x - 4, y - 4, w + 8, h + 8).fill(BENCH_EDGE);
      this.tops.rect(x, y, w, h).fill(BENCH_WOOD);
    }

    // Everything lying on the tops, where the layout says it lies.
    this.pieces.removeChildren().forEach((child) => child.destroy());
    for (const piece of groupPieces(group)) {
      const holder = new Container();
      const size = placedPieceSize(piece.material, piece.placement);
      const sprite = createMaterialSprite(piece.material, {
        onEdge: piece.placement.onEdge,
        onEnd: piece.placement.onEnd,
      });
      sprite.scale.set(fit.spriteScale);
      holder.addChild(sprite);
      holder.position.set(
        fit.originX + piece.placement.xIn * fit.pxPerIn,
        fit.originY + piece.placement.yIn * fit.pxPerIn,
      );
      holder.angle = piece.placement.angleDeg;
      // placedPieceSize is the hit footprint; the sprite draws centered
      // already, so size is only consulted by the gesture surfaces.
      void size;
      this.pieces.addChild(holder);
    }
  }
}
