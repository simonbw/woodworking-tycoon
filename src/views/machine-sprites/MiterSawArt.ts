import { Container, Graphics } from "pixi.js";
import { inchesToPixels } from "../../components/shop-view/shop-scale";
import { isBoard } from "../../game/board-helpers";
import { Machine } from "../../game/Machine";
import { CutParticleEmitter, cutSprayIntensity } from "./CutParticleEmitter";
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
 * The miter saw — the old `MiterSawSprite`: the stationary base, the
 * turntable swung to the set detent, the board slid along the fence so
 * the cut mark lies under the blade, and the head sinking through the
 * chop (buzzing while the motor runs) with the kerf deepening across the
 * board beneath it.
 */
export class MiterSawArt extends MachineArtBase {
  private readonly slide = new Container();
  private readonly outputs = new Container();
  private readonly turntable = new Container();
  private readonly swingAssembly = new Container();
  private readonly kerfGraphics = new Graphics();
  private readonly vibrating = new Container();
  private readonly plunge = new Container();

  private readonly slideX = new Smoothed(0);
  private readonly headSwing = new Smoothed(0);
  private readonly plungeP = new Smoothed(0);
  private firstBuild = true;

  private kerfY = 0;
  private kerfHalf = 0;
  private fraction = 0;
  private hasCut = false;

  // The pivot is the turntable circle's center, measured off the art:
  // 10 image pixels above the canvas center in miter-saw-rotating-base.png
  private readonly pivotY = -10 * IMAGE_SCALE;

  private readonly roosterTail: CutParticleEmitter;
  private readonly ambientSpray: CutParticleEmitter;

  constructor(machine: Machine) {
    super();
    const [fpX, fpY] = footprintOffset(machine);
    // The blade hurls a thick rooster tail back behind the fence, tilted
    // with the head; fine dust boils out around the blade all directions.
    this.roosterTail = new CutParticleEmitter({
      kind: "dust",
      x: fpX,
      y: fpY,
      direction: -Math.PI / 2,
      spread: 0.7,
      density: 1.6,
    });
    this.ambientSpray = new CutParticleEmitter({
      kind: "dust",
      x: fpX,
      y: fpY,
      direction: 0,
      ambient: true,
      density: 0.8,
    });

    const holder = footprintContainer(machine);
    holder.addChild(artSprite("/images/miter-saw-stationary-base.png"));

    // The turntable swings under the stock (the board stays put against
    // the fence while the table turns beneath it)
    this.turntable.y = this.pivotY;
    const turntableSprite = artSprite("/images/miter-saw-rotating-base.png");
    turntableSprite.y = -this.pivotY;
    this.turntable.addChild(turntableSprite);
    holder.addChild(this.turntable);

    holder.addChild(this.slide);
    holder.addChild(this.outputs);

    // Kerf and head swing about the same pivot as the turntable, so the
    // cut line on the board always lies under the blade
    this.swingAssembly.y = this.pivotY;
    const swingInner = new Container();
    swingInner.y = -this.pivotY;
    swingInner.addChild(this.kerfGraphics);
    this.plunge.addChild(artSprite("/images/miter-saw-top.png"));
    this.vibrating.addChild(this.plunge);
    swingInner.addChild(this.vibrating);
    this.swingAssembly.addChild(swingInner);
    holder.addChild(this.swingAssembly);

    this.root.addChild(holder);
  }

  rebuild(machine: Machine, activity: MachineActivity): void {
    this.clearContainer(this.slide);
    this.clearContainer(this.outputs);

    const { inputMaterials, outputMaterials } = machine;
    const inputBoards = inputMaterials.filter(isBoard);
    const processingBoards = machine.processingMaterials.filter(isBoard);
    // The board on the saw table: set down there with F, and still there
    // mid-cut (it moves to processing but stays clamped in place).
    const stock = inputBoards[0] ?? processingBoards[0];

    // The cut line sits cutPosition inches from the stock's left end, so
    // the rest of the board slides out past the blade to the right.
    // Clamped so a mark beyond the board's far end parks the whole board
    // short of the blade instead of detaching it from the saw.
    const cutPosition = Number(machine.selectedParameters?.cutPosition) || 0;
    this.slideX.target = stock
      ? inchesToPixels(Math.max(0, stock.length - cutPosition))
      : 0;

    // The head sinks through the chop and lifts once the cut releases
    this.plungeP.target = processingBoards.length > 0 ? activity.fraction : 0;

    // The whole swing assembly — turntable, detent handle, kerf, and
    // head — rotates to the set detent, so the shop reads "the saw's
    // still set to 45" at a glance.
    this.headSwing.target = Number(machine.selectedParameters?.angle) || 0;

    if (this.firstBuild) {
      this.slideX.snap(this.slideX.target);
      this.plungeP.snap(this.plungeP.target);
      this.headSwing.snap(this.headSwing.target);
      this.firstBuild = false;
    }

    for (const board of [...inputBoards, ...processingBoards]) {
      const holder = new Container();
      holder.angle = 90;
      holder.position.set(
        inchesToPixels(-board.length / 2) - 3,
        inchesToPixels(board.width / 2 - 3),
      );
      const sprite = buildMaterialSprite(board);
      if (sprite) holder.addChild(sprite);
      this.slide.addChild(holder);
    }

    // Off-cuts sit on the table past the blade — they don't ride the slide
    outputMaterials.filter(isBoard).forEach((board, index) => {
      const holder = new Container();
      holder.angle = 90 + index * 5;
      holder.position.set(
        inchesToPixels(board.length / 2) + 3,
        inchesToPixels(board.width / 2 - 3),
      );
      const sprite = buildMaterialSprite(board);
      if (sprite) holder.addChild(sprite);
      this.outputs.addChild(holder);
    });

    const cutting = processingBoards[0];
    this.hasCut = cutting !== undefined;
    this.fraction = activity.fraction;
    this.kerfY = cutting ? inchesToPixels(cutting.width / 2 - 3) : 0;
    this.kerfHalf = cutting ? inchesToPixels(cutting.width / 2) : 0;
    this.drawKerf();
  }

  private drawKerf(): void {
    const g = this.kerfGraphics;
    g.clear();
    if (!this.hasCut || this.fraction === 0) return;
    // The cut deepens across the board as the chop comes down
    g.moveTo(0, this.kerfY - this.kerfHalf);
    g.lineTo(
      0,
      this.kerfY -
        this.kerfHalf +
        2 * this.kerfHalf * Math.min(1, this.fraction * 1.2),
    );
    g.stroke({ width: 2.5, color: 0x120d08, alpha: 0.85 });
  }

  override animate(
    dt: number,
    machine: Machine,
    activity: MachineActivity,
    fx: EffectsFrame,
  ): void {
    this.slideX.update(dt);
    this.headSwing.update(dt);
    this.plungeP.update(dt);

    this.slide.x = this.slideX.value;
    this.turntable.angle = this.headSwing.value;
    this.swingAssembly.angle = this.headSwing.value;
    this.plunge.scale.set(1 - 0.05 * this.plungeP.value);
    this.plunge.y = this.plungeP.value * 2.5;

    // Buzzes the head with a tiny random jitter while the motor runs —
    // the universal body language of a power tool (the old Vibrating).
    if (activity.powered) {
      this.vibrating.x = (Math.random() * 2 - 1) * 0.6;
      this.vibrating.y = (Math.random() * 2 - 1) * 0.6;
    } else {
      this.vibrating.position.set(0, 0);
    }

    const cutting = machine.processingMaterials.filter(isBoard)[0];
    const active = cutting !== undefined && activity.working;
    if (cutting || !this.roosterTail.isEmpty || !this.ambientSpray.isEmpty) {
      const angleSetting = Number(machine.selectedParameters?.angle) || 0;
      this.roosterTail.setDirection(
        -Math.PI / 2 + (angleSetting * Math.PI) / 180,
      );
      const intensity = cutting ? cutSprayIntensity(machine) : 0;
      const species = cutting?.species ?? "pine";
      this.roosterTail.update(dt, active, intensity, species, fx);
      this.ambientSpray.update(dt, active, intensity, species, fx);
    }
  }
}
