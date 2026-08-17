import { Container } from "pixi.js";
import { inchesToPixels } from "../shop-scale";
import { isBoard } from "../../game/board-helpers";
import { Machine } from "../../game/Machine";
import { stockOrientation } from "../../game/machine-helpers";
import { Board } from "../../game/Materials";
import { CutParticleEmitter, cutSprayIntensity } from "./CutParticleEmitter";
import { FeedingBoardArt } from "./FeedingBoardArt";
import { MachineActivity } from "./machine-activity";
import {
  artSprite,
  EffectsFrame,
  footprintContainer,
  footprintOffset,
  MachineArtBase,
} from "./machine-art";
import { buildMaterialSprite } from "./material-slot";

/**
 * Top-down 14" band saw — the old `BandSawSprite`: the cast-iron table
 * with the wheel housings and motor hanging off its left, and the upper
 * housing's arm reaching over the work to the guides. Stock rides
 * against the fence, which slides in toward the blade as the fence
 * setting comes down — standing on edge for a resaw, lying flat for a
 * rip (R turns it over).
 *
 * Everything the saw does happens on the blade line, so the stock, the
 * cut, and the dust are all placed relative to it rather than to the art.
 */

/** The art's own pixels: 400×400 export at 8 image pixels to the inch. */
const ART_CENTER = 200;
const ART_PIXELS_PER_INCH = 8;
const artToShop = (pixels: number) =>
  inchesToPixels(pixels / ART_PIXELS_PER_INCH);

/**
 * Where the blade comes through the table, in the art's pixels — (245,
 * 200). The fence is drawn with its working face right against it.
 */
const BLADE_ART_X = 245;

/** The blade in the sprite's own pixels, out from the middle of the art. */
const BLADE_OFFSET = artToShop(BLADE_ART_X - ART_CENTER);

/**
 * The lower wheel housing's door, off the left of the table — where the
 * dust that drops through the table works its way back out.
 */
const HOUSING_OFFSET = artToShop(80 - BLADE_ART_X);

export class BandSawArt extends MachineArtBase {
  private readonly stock = new Container();
  private readonly fence: Container;
  private feeding: FeedingBoardArt[] = [];

  // Most of the dust drops through the table into the lower wheel
  // housing and puffs out the door; the rest rides the blade back up
  // onto the table. Emitter coordinates are machine-local (footprint
  // center plus the blade line), since the effects graphics draws in
  // machine space.
  private readonly housingSpray: CutParticleEmitter;
  private readonly bladeSpray: CutParticleEmitter;

  constructor(machine: Machine) {
    super();
    const [fpX, fpY] = footprintOffset(machine);
    this.housingSpray = new CutParticleEmitter({
      kind: "dust",
      x: fpX + BLADE_OFFSET + HOUSING_OFFSET,
      y: fpY,
      direction: Math.PI,
      spread: 0.8,
      density: 1.1,
    });
    this.bladeSpray = new CutParticleEmitter({
      kind: "dust",
      x: fpX + BLADE_OFFSET,
      y: fpY,
      direction: Math.PI / 2,
      density: 0.8,
    });

    // Canvas-centered art, mounted on the footprint center.
    const holder = footprintContainer(machine);
    holder.addChild(artSprite("/images/bandsaw-14-lower.png"));
    // The work sits on the table, under the arm that reaches over it
    this.stock.x = BLADE_OFFSET;
    holder.addChild(this.stock);
    // The fence was drawn against the blade, so the setting is the whole
    // of its travel — no correction for where it sits in the art
    this.fence = new Container();
    this.fence.addChild(artSprite("/images/bandsaw-14-fence.png"));
    holder.addChild(this.fence);
    holder.addChild(artSprite("/images/bandsaw-14-upper.png"));
    this.root.addChild(holder);
  }

  rebuild(machine: Machine, activity: MachineActivity): void {
    this.clearContainer(this.stock);
    this.feeding = [];

    const { inputMaterials, processingMaterials, outputMaterials } = machine;

    // How the stock sits right now decides how staged boards draw and
    // which fence setting positions the fence: the resaw's, in quarters,
    // or the rip's, in inches. Mid-cut (and for the pieces left on the
    // table after one) the recorded operation says which cut it was, so
    // toggling R never flips work already committed to the blade.
    const onEdgeNow = stockOrientation(machine) === "on edge";
    const committedWork =
      processingMaterials.length > 0 || outputMaterials.length > 0;
    const cutOnEdge = committedWork
      ? machine.state.selectedOperationId !== "ripBoard"
      : onEdgeNow;
    const fenceSetting = onEdgeNow
      ? (Number(machine.selectedParameters?.targetThickness) || 4) / 4
      : Number(machine.selectedParameters?.targetWidth) || 4;
    const fenceFace = -inchesToPixels(fenceSetting);
    this.fence.x = fenceFace;

    // Stock rides one surface against the fence, so it hangs off the
    // fence toward (and past) the blade by its own extent: its thickness
    // standing on edge, its width lying flat.
    const boardX = (board: Board, onEdge: boolean) =>
      fenceFace +
      inchesToPixels(onEdge ? board.thickness / 8 : board.width / 2);
    const boardSprite = (board: Board, onEdge: boolean) =>
      buildMaterialSprite(board, { onEdge });

    for (const board of inputMaterials.filter(isBoard)) {
      const holder = new Container();
      holder.position.set(
        boardX(board, onEdgeNow),
        inchesToPixels(board.length / 2),
      );
      const sprite = boardSprite(board, onEdgeNow);
      if (sprite) holder.addChild(sprite);
      this.stock.addChild(holder);
    }

    for (const board of processingMaterials.filter(isBoard)) {
      const feeding = new FeedingBoardArt({
        board,
        fraction: activity.fraction,
        fromY: inchesToPixels(board.length / 2),
        toY: -inchesToPixels(board.length / 2),
        x: boardX(board, cutOnEdge),
        sprite: boardSprite(board, cutOnEdge),
      });
      this.stock.addChild(feeding.root);
      this.feeding.push(feeding);
    }

    // Both pieces come off the back of the table, side by side — a
    // resaw's thin halves at a fixed pitch, a rip's two widths laid out
    // edge to edge
    let flatEdge = fenceFace;
    outputMaterials.filter(isBoard).forEach((board, index) => {
      const x = cutOnEdge
        ? boardX(board, true) + inchesToPixels(index * 1.2)
        : flatEdge + inchesToPixels(board.width / 2);
      flatEdge += inchesToPixels(board.width + 0.6);
      const holder = new Container();
      holder.position.set(
        x,
        -inchesToPixels(board.length / 2) - inchesToPixels(2),
      );
      const sprite = boardSprite(board, cutOnEdge);
      if (sprite) holder.addChild(sprite);
      this.stock.addChild(holder);
    });
  }

  override animate(
    dt: number,
    machine: Machine,
    activity: MachineActivity,
    fx: EffectsFrame,
  ): void {
    for (const feeding of this.feeding) {
      feeding.setFraction(activity.fraction);
      feeding.update(dt);
    }

    const cutting = machine.processingMaterials.filter(isBoard)[0];
    const active = cutting !== undefined && activity.working;
    if (cutting || !this.housingSpray.isEmpty || !this.bladeSpray.isEmpty) {
      const intensity = cutting ? cutSprayIntensity(machine) : 0;
      const species = cutting?.species ?? "pine";
      this.housingSpray.update(dt, active, intensity, species, fx);
      this.bladeSpray.update(dt, active, intensity, species, fx);
    }
  }
}
