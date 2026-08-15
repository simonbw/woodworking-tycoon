import { Container } from "pixi.js";
import {
  inchesToPixels,
  PIXELS_PER_INCH,
} from "../../components/shop-view/shop-scale";
import { isBoard } from "../../game/board-helpers";
import { Machine } from "../../game/Machine";
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

/** Where the fence's working face sits in the texture. */
const FENCE_INNER_X = 19;

/**
 * Top-down jointer — the old `JointerSprite`: long infeed/outfeed tables
 * split by the cutterhead, with a fence along the right side. Edge
 * jointing stands the board on edge against the fence; face jointing
 * lays it flat on the beds.
 */
export class JointerArt extends MachineArtBase {
  private readonly stock = new Container();
  private feeding: FeedingBoardArt[] = [];

  private readonly shavingsSpray: CutParticleEmitter;
  private readonly portSpray: CutParticleEmitter;
  private readonly ambientSpray: CutParticleEmitter;

  constructor(machine: Machine) {
    super();
    const [fpX, fpY] = footprintOffset(machine);
    // Curls spill off the cutterhead toward the outfeed table; the chip
    // port ejects a jet of dust out the side, away from the fence; and
    // fine dust boils up around the cutterhead and the board.
    this.shavingsSpray = new CutParticleEmitter({
      kind: "shavings",
      x: fpX,
      y: fpY,
      direction: -Math.PI / 2,
      spread: 1.5,
      density: 1.3,
    });
    this.portSpray = new CutParticleEmitter({
      kind: "dust",
      x: fpX - 8,
      y: fpY,
      direction: Math.PI,
      spread: 0.7,
      density: 0.9,
    });
    this.ambientSpray = new CutParticleEmitter({
      kind: "dust",
      x: fpX,
      y: fpY,
      direction: 0,
      ambient: true,
      density: 0.7,
    });

    const holder = footprintContainer(machine);
    holder.addChild(artSprite("/images/benchtop-jointer.png"));
    holder.addChild(this.stock);
    this.root.addChild(holder);
  }

  rebuild(machine: Machine, activity: MachineActivity): void {
    this.clearContainer(this.stock);
    this.feeding = [];

    const { inputMaterials, processingMaterials, outputMaterials } = machine;
    const edgeMode = machine.state.selectedOperationId === "jointEdge";
    const boardX = (board: Board, index: number) =>
      edgeMode
        ? FENCE_INNER_X -
          Math.max(3, (board.thickness * PIXELS_PER_INCH) / 4) / 2 -
          index * 5
        : index * 4;
    const boardSprite = (board: Board) =>
      buildMaterialSprite(board, { onEdge: edgeMode });

    inputMaterials.filter(isBoard).forEach((board, index) => {
      const holder = new Container();
      holder.position.set(
        boardX(board, index),
        inchesToPixels(board.length / 2),
      );
      const sprite = boardSprite(board);
      if (sprite) holder.addChild(sprite);
      this.stock.addChild(holder);
    });

    processingMaterials.filter(isBoard).forEach((board, index) => {
      const feeding = new FeedingBoardArt({
        board,
        fraction: activity.fraction,
        fromY: inchesToPixels(board.length / 2),
        toY: -inchesToPixels(board.length / 2),
        x: boardX(board, index),
        // Flat feeding falls back to the board's own drawing; on edge it
        // rides the fence standing up.
        sprite: edgeMode ? boardSprite(board) : undefined,
      });
      this.stock.addChild(feeding.root);
      this.feeding.push(feeding);
    });

    outputMaterials.filter(isBoard).forEach((board, index) => {
      const holder = new Container();
      holder.position.set(
        boardX(board, index),
        -inchesToPixels(board.length / 2),
      );
      const sprite = boardSprite(board);
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
    const anyAlive =
      !this.shavingsSpray.isEmpty ||
      !this.portSpray.isEmpty ||
      !this.ambientSpray.isEmpty;
    if (cutting || anyAlive) {
      const intensity = cutting ? cutSprayIntensity(machine) : 0;
      const species = cutting?.species ?? "pine";
      this.shavingsSpray.update(dt, active, intensity, species, fx);
      this.portSpray.update(dt, active, intensity, species, fx);
      this.ambientSpray.update(dt, active, intensity, species, fx);
    }
  }
}
