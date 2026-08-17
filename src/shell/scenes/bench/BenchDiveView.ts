import { Container, Graphics } from "pixi.js";
import { Persistence } from "../../../config/constants";
import { BaseEntity } from "../../../core/entity/BaseEntity";
import { Entity } from "../../../core/entity/Entity";
import { GameSprite } from "../../../core/entity/GameSprite";
import { on } from "../../../core/entity/handler";
import { StageFit } from "./stageMath";
import { groupPieces } from "../../../game/bench-work/bench-group";
import { BenchPlacement } from "../../../game/bench-work/bench-layout";
import { placedPieceSize } from "../../../game/bench-work/workpiece";
import { MaterialInstance } from "../../../game/Materials";
import { createMaterialSprite } from "../../../views/material-sprites/MaterialSprite";
import { ShellStore } from "../../ShellStore";
import { BenchArrangeView } from "./BenchArrangeView";
import { BenchDive } from "./BenchDive";
import { V } from "../../../core/Vector";
import { PIXELS_PER_INCH } from "../../../views/shop-scale";
import { BenchStage, benchStage, benchWork, workpieceSpot } from "./benchStage";

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
  /**
   * Everything drawn in stage coordinates — the run's tops, the pieces,
   * and every gesture surface's own graphics, which attach here rather
   * than to the layer. One container carries the lean-in, so the whole
   * picture rides one motion.
   */
  readonly frame = new Container();
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
    /** How the piece is turned on the top — a gesture that runs along
     * one of its axes (the saw's line) needs the heading, not just the
     * middle. */
    angleDeg: number;
    pxPerIn: number;
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
        angleDeg: piece.placement.angleDeg,
        pxPerIn: fit.pxPerIn,
      };
    });
  }

  constructor() {
    super();
    this.root = new Container() as Container & GameSprite;
    this.root.layerName = "hud";
    this.root.visible = false;
    this.frame.addChild(this.tops, this.pieces);
    this.root.addChild(this.backdrop, this.frame);
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

    // The lean-in: at the start of the dive the whole surface sits on
    // the bench's own footprint on the shop floor, and it eases up to
    // the full frame — the old shell's camera dive, carried by the one
    // container everything on the stage draws into. (The shop no longer
    // swells pixel-locked behind it; see MIGRATION.md.)
    this.leanIn(dive.dive, stage);

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

    // Everything lying on the tops, where the layout says it lies —
    // except a piece riding the hand, which the arranging view draws
    // where the hand has it rather than where it was set down.
    const dragging = game.entities
      .tryGetSingleton(BenchArrangeView)
      ?.draggingId();
    this.pieces.removeChildren().forEach((child) => child.destroy());
    for (const piece of groupPieces(group)) {
      if (piece.material.id === dragging) continue;
      this.pieces.addChild(
        pieceHolder(piece.material, piece.placement, stage.fit),
      );
    }

    // The piece a running job holds left the pile when the operation
    // claimed it, so the group no longer lists it — but it's still lying
    // right there under the hands. The saw draws its own board (in two
    // halves, so the offcut can sag open); everything else draws here.
    const work = benchWork(game);
    const held =
      work?.script.kind === "stroke" ? work.script.workpiece : undefined;
    if (work && held) {
      const spot = workpieceSpot(group, work.machine, held);
      if (spot) {
        this.pieces.addChild(pieceHolder(held, spot.placement, stage.fit));
      }
    }
  }

  /**
   * Ride the dive: at 0 the stage is mapped onto the bench's footprint
   * where it stands on the shop floor, at 1 it is the frame itself. The
   * backdrop comes up with it, so the shop dims as the bench arrives.
   */
  private leanIn(progress: number, stage: BenchStage): void {
    const eased = easeInOutCubic(Math.min(1, Math.max(0, progress)));
    this.backdrop.alpha = eased;
    if (eased >= 1) {
      this.frame.scale.set(1);
      this.frame.position.set(0, 0);
      return;
    }
    const { fit, group } = stage;
    // Where the run sits on the floor, in the canvas the camera draws.
    const camera = this.game.camera;
    const [screenX, screenY] = camera.toScreen(
      V(
        group.centerInShopIn.xIn * PIXELS_PER_INCH,
        group.centerInShopIn.yIn * PIXELS_PER_INCH,
      ),
    );
    // An inch of bench is this many screen pixels out on the floor.
    const floorScale = (camera.z * PIXELS_PER_INCH) / fit.pxPerIn;
    const scale = floorScale + (1 - floorScale) * eased;
    // The middle of the finished picture, in stage coordinates.
    const centerX = fit.originX + (group.widthIn / 2) * fit.pxPerIn;
    const centerY = fit.originY + (group.heightIn / 2) * fit.pxPerIn;
    const targetX = screenX + (centerX - screenX) * eased;
    const targetY = screenY + (centerY - screenY) * eased;
    this.frame.scale.set(scale);
    this.frame.position.set(
      targetX - centerX * scale,
      targetY - centerY * scale,
    );
  }
}

/** The cubic the dive rides, the old scene's own easing. */
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** One piece, drawn where it lies on the stage. */
function pieceHolder(
  material: MaterialInstance,
  placement: BenchPlacement,
  fit: StageFit,
): Container {
  const holder = new Container();
  const sprite = createMaterialSprite(material, {
    onEdge: placement.onEdge,
    onEnd: placement.onEnd,
  });
  sprite.scale.set(fit.spriteScale);
  holder.addChild(sprite);
  holder.position.set(
    fit.originX + placement.xIn * fit.pxPerIn,
    fit.originY + placement.yIn * fit.pxPerIn,
  );
  holder.angle = placement.angleDeg;
  holder.scale.x = placement.flipped ? -1 : 1;
  return holder;
}
