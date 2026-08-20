import { Container, Graphics } from "pixi.js";
import { Persistence } from "../../../config/constants";
import { BaseEntity } from "../../../core/entity/BaseEntity";
import { Entity } from "../../../core/entity/Entity";
import { GameSprite } from "../../../core/entity/GameSprite";
import { on } from "../../../core/entity/handler";
import {
  groupPieces,
  turnIntoFrame,
} from "../../../game/bench-work/bench-group";
import { BenchPlacement } from "../../../game/bench-work/bench-layout";
import { placedPieceSize } from "../../../game/bench-work/workpiece";
import { MaterialInstance } from "../../../game/Materials";
import { PieceMotion } from "./PieceMotion";
import { ShellStore } from "../../ShellStore";
import { BenchArrangeView } from "./BenchArrangeView";
import { BenchDive } from "./BenchDive";
import { V } from "../../../core/Vector";
import {
  IMAGE_PIXELS_PER_INCH,
  PIXELS_PER_INCH,
} from "../../../views/shop-scale";
import { artSprite } from "../../../views/machine-sprites/machine-art";
import { benchCloseUpArt } from "../../../views/machine-sprites/worktable-art";
import { BenchStage, benchStage } from "./benchStage";

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
  /**
   * The run's tops, in three passes: every table's cast shadow first, so
   * a neighbour's shadow never falls across the top butted against it,
   * then the drawn top for any bench whose art hasn't been made yet,
   * then the art itself.
   */
  private shadows = new Container();
  private topRects = new Graphics();
  private topArt = new Container();
  private pieces = new Container();

  /**
   * One holder per piece on the tops, kept across redraws so a turn or
   * a tumble is motion on a standing sprite instead of a swap — R and F
   * read as the piece being turned by hand (the old scene's spring and
   * FlipTumble). The sprites inside rebuild only when the piece itself
   * changes (a new material instance).
   */
  private holders = new Map<string, PieceMotion>();

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
    this.frame.addChild(this.shadows, this.topRects, this.topArt, this.pieces);
    this.root.addChild(this.backdrop, this.frame);
    this.sprite = this.root;
  }

  @on("render")
  onRender(dt: number) {
    const game = this.game;
    const renderer = game.renderer;
    const dive = game.entities.tryGetSingleton(BenchDive);
    const stage = benchStage(game);
    if (!renderer || !dive || !stage) {
      this.root.visible = false;
      this.drawnKey = null;
      this.clearHolders();
      return;
    }
    this.root.visible = true;
    const { fit, group } = stage;

    // The lean-in: at the start of the dive the whole surface sits on
    // the bench's own footprint on the shop floor, and it eases up to
    // the full frame — the old shell's camera dive, carried by the one
    // container everything on the stage draws into. (The shop no longer
    // swells pixel-locked behind it, the way the old shell's camera
    // dive did.)
    this.leanIn(dive.dive, stage);

    // The turn/flip springs run every frame, whether or not the sim
    // moved — that's the whole point of keeping the holders.
    for (const motion of this.holders.values()) {
      motion.step(dt);
    }

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

    // The run's tops: the same drawing the shop floor puts under the
    // player's feet, off its close-up export. The art covers the whole
    // machine — the makeshift bench's buckets stick out past its
    // plywood — so it hangs on the footprint's middle, which is where
    // `member.rect` is centered, rather than being stretched to the
    // top's own rectangle. A table pushed onto the run at an angle is
    // turned into the frame by the quarter turns its placements take.
    this.clearTops();
    this.topRects.clear();
    const artScale = fit.pxPerIn / IMAGE_PIXELS_PER_INCH;
    for (const member of group.members) {
      const centerX =
        fit.originX + (member.rect.xIn + member.rect.widthIn / 2) * fit.pxPerIn;
      const centerY =
        fit.originY +
        (member.rect.yIn + member.rect.heightIn / 2) * fit.pxPerIn;
      const art = benchCloseUpArt(member.machine.type.id);
      if (!art) {
        const x = fit.originX + member.rect.xIn * fit.pxPerIn;
        const y = fit.originY + member.rect.yIn * fit.pxPerIn;
        const w = member.rect.widthIn * fit.pxPerIn;
        const h = member.rect.heightIn * fit.pxPerIn;
        this.topRects.rect(x - 4, y - 4, w + 8, h + 8).fill(BENCH_EDGE);
        this.topRects.rect(x, y, w, h).fill(BENCH_WOOD);
        continue;
      }
      const angle = turnIntoFrame(member, group) * -90;
      if (art.shadow) {
        const shadow = artSprite(art.shadow, artScale);
        shadow.position.set(centerX, centerY);
        shadow.angle = angle;
        this.shadows.addChild(shadow);
      }
      const top = artSprite(art.top, artScale);
      top.position.set(centerX, centerY);
      top.angle = angle;
      this.topArt.addChild(top);
    }

    // Everything lying on the tops, where the layout says it lies —
    // except a piece riding the hand, which the arranging view draws
    // where the hand has it rather than where it was set down. A piece a
    // running job claimed left the pile with it, and that job's gesture
    // surface draws it: the saw in two halves so the offcut can sag
    // open, stroke work as two surface states with the finished one
    // scratched in under the tool.
    const arrange = game.entities.tryGetSingleton(BenchArrangeView);
    const dragging = arrange?.draggingId();
    const lying: Array<{
      material: MaterialInstance;
      placement: BenchPlacement;
    }> = [];
    for (const piece of groupPieces(group)) {
      if (piece.material.id === dragging) continue;
      lying.push(piece);
    }

    // Sync the holders: pieces come and go, standing holders retarget —
    // the springs carry a changed angle or flip as motion.
    const seen = new Set<string>();
    for (const piece of lying) {
      seen.add(piece.material.id);
      let motion = this.holders.get(piece.material.id);
      if (!motion) {
        // A just-released piece keeps the holder that rode the hand, so
        // the springs carry it from the drop point into its seat instead
        // of it reappearing already there.
        motion = arrange?.takeHandoff(piece.material.id) ?? new PieceMotion();
        this.holders.set(piece.material.id, motion);
        this.pieces.addChild(motion.holder);
      }
      motion.retarget(piece.material, piece.placement, stage.fit);
    }
    for (const [id, motion] of this.holders) {
      if (seen.has(id)) continue;
      motion.holder.destroy({ children: true });
      this.holders.delete(id);
    }
    // Standing holders keep their mount order otherwise, and the stack's
    // draw order has to match the layout's (pieceUnder reads it in
    // reverse) — so re-stack to the group's order every redraw.
    lying.forEach((piece, index) => {
      const motion = this.holders.get(piece.material.id);
      if (motion) this.pieces.setChildIndex(motion.holder, index);
    });
  }

  /** The standing holder drawing this piece, for chrome (the arranging
   * view's hairline) that wants to follow its motion. */
  motionFor(materialId: string): PieceMotion | null {
    return this.holders.get(materialId) ?? null;
  }

  private clearTops(): void {
    for (const container of [this.shadows, this.topArt]) {
      container.removeChildren().forEach((child) => child.destroy());
    }
  }

  private clearHolders(): void {
    if (this.holders.size === 0) return;
    this.pieces.removeChildren().forEach((child) => child.destroy());
    this.holders.clear();
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
