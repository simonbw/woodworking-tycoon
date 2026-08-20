import { Container, Sprite } from "pixi.js";
import { inchesToPixels, PIXELS_PER_INCH } from "../shop-scale";
import { isBoard } from "../../game/board-helpers";
import { Machine } from "../../game/Machine";
import { thicknessStepBelow } from "../../game/machines/lunchboxPlaner";
import { BOARD_DIMENSIONS, BoardDimension } from "../../game/Materials";
import { lerp } from "../../utils/mathUtils";
import { CutParticleEmitter, cutSprayIntensity } from "./CutParticleEmitter";
import { FeedingBoardArt } from "./FeedingBoardArt";
import { MachineActivity } from "./machine-activity";
import {
  artSprite,
  EffectsFrame,
  footprintContainer,
  footprintOffset,
  IMAGE_SCALE,
  MachineArtBase,
  Smoothed,
} from "./machine-art";
import { buildMaterialSprite } from "./material-slot";

/**
 * The lunchbox planer — the old `LunchboxPlanerSprite`: the bottom
 * casting with the boards staged at the infeed, the top casting riding
 * at the target thickness (its scale breathes with the cut height), the
 * screws capping it, and the snow machine out the outfeed side while a
 * board feeds through.
 */
export class LunchboxPlanerArt extends MachineArtBase {
  private readonly stock = new Container();
  private readonly topSprite: Sprite;
  private feeding: FeedingBoardArt[] = [];
  private readonly topScale = new Smoothed(IMAGE_SCALE);
  private firstBuild = true;

  private readonly shavingsSpray: CutParticleEmitter;
  private readonly portSpray: CutParticleEmitter;
  private readonly ambientSpray: CutParticleEmitter;

  constructor(machine: Machine) {
    super();
    const [fpX, fpY] = footprintOffset(machine);
    // A lunchbox planer is a snow machine out the outfeed side; wide
    // spread so the curls scatter off the exiting board. The chip port
    // blasts a hard jet of dust alongside the curls, and fine dust leaks
    // out around the board at the cutter head.
    this.shavingsSpray = new CutParticleEmitter({
      kind: "shavings",
      x: fpX,
      y: fpY - 26,
      direction: -Math.PI / 2,
      spread: 1.7,
      density: 1.3,
    });
    this.portSpray = new CutParticleEmitter({
      kind: "dust",
      x: fpX,
      y: fpY - 26,
      direction: -Math.PI / 2,
      spread: 1,
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
    holder.addChild(artSprite("/images/lunchbox-planer-bottom.png"));
    holder.addChild(this.stock);
    this.topSprite = artSprite("/images/lunchbox-planer-top.png");
    holder.addChild(this.topSprite);
    holder.addChild(
      artSprite("/images/lunchbox-planer-screws.png", IMAGE_SCALE + 0.01),
    );
    this.root.addChild(holder);
  }

  rebuild(machine: Machine, activity: MachineActivity): void {
    this.clearContainer(this.stock);
    this.feeding = [];

    const { inputMaterials, processingMaterials, outputMaterials } = machine;

    // The cutter head rides at the target thickness
    const cutThickness =
      Number(machine.selectedParameters?.targetThickness) ||
      Math.max(...BOARD_DIMENSIONS);
    this.topScale.target = IMAGE_SCALE + cutThickness * 0.005;
    if (this.firstBuild) {
      this.topScale.snap(this.topScale.target);
      this.firstBuild = false;
    }

    inputMaterials.filter(isBoard).forEach((board, index) => {
      const holder = new Container();
      holder.position.set(
        lerp(
          -inputMaterials.length * PIXELS_PER_INCH,
          inputMaterials.length * PIXELS_PER_INCH,
          index / inputMaterials.length,
        ),
        inchesToPixels(board.length / 2),
      );
      const sprite = buildMaterialSprite(board);
      if (sprite) holder.addChild(sprite);
      this.stock.addChild(holder);
    });

    outputMaterials.filter(isBoard).forEach((board, index) => {
      const holder = new Container();
      holder.position.set(
        lerp(
          -outputMaterials.length * PIXELS_PER_INCH,
          outputMaterials.length * PIXELS_PER_INCH,
          index / outputMaterials.length,
        ),
        -inchesToPixels(board.length / 2),
      );
      const sprite = buildMaterialSprite(board);
      if (sprite) holder.addChild(sprite);
      this.stock.addChild(holder);
    });

    processingMaterials.filter(isBoard).forEach((board, index) => {
      const feeding = new FeedingBoardArt({
        board,
        // Mirrors the plane operation's output: one detent off at most,
        // smooth surface emerging from the outfeed past the cutter head
        exitedAs: {
          ...board,
          thickness: Math.max(
            cutThickness,
            thicknessStepBelow(board.thickness) ?? board.thickness,
          ) as BoardDimension,
          jointedFaces: 2,
          surface: "smooth",
        },
        fraction: activity.fraction,
        fromY: inchesToPixels(board.length / 2),
        toY: -inchesToPixels(board.length / 2),
        x: lerp(
          -processingMaterials.length * PIXELS_PER_INCH,
          processingMaterials.length * PIXELS_PER_INCH,
          index / processingMaterials.length,
        ),
      });
      this.stock.addChild(feeding.root);
      this.feeding.push(feeding);
    });
  }

  override animate(
    dt: number,
    machine: Machine,
    activity: MachineActivity,
    fx: EffectsFrame,
  ): void {
    this.topScale.update(dt);
    this.topSprite.scale.set(this.topScale.value);

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
