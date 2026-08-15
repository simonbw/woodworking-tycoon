import { Container, Graphics, Sprite, Texture } from "pixi.js";
import {
  feetToPixels,
  inchesToPixels,
  PIXELS_PER_INCH,
} from "../../components/shop-view/shop-scale";
import { isBoard } from "../../game/board-helpers";
import { Machine, operationParameters } from "../../game/Machine";
import { stockOrientation } from "../../game/machine-helpers";
import { materialDustSpecies } from "../../game/material-helpers";
import {
  BOARD_DIMENSIONS,
  DustSpecies,
  MaterialInstance,
  panelWidth,
} from "../../game/Materials";
import { isPanel } from "../../game/panel-helpers";
import { TOOL_TYPES } from "../../game/Tool";
import { lerp } from "../../utils/mathUtils";
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

/** The jigs that live on the saw table while mounted. */
const SLED_TOOLS = ["straightLineSled", "crosscutSled"] as const;
type SledId = (typeof SLED_TOOLS)[number];

/** Width across the blade for anything the saw can be cutting. */
function stockWidth(material: MaterialInstance): number {
  if (isBoard(material)) return material.width;
  if (isPanel(material)) return panelWidth(material);
  return 8;
}

/** What the spray off this stock is colored by — a sheet's chips are the
 * sheet's own pseudo-species, not a wood. */
function stockSpecies(material: MaterialInstance): DustSpecies {
  return materialDustSpecies(material)[0] ?? "pine";
}

// Sled plywood and hardware, in the sprites' brown palette
const SLED_PLY = 0xd7b98a;
const SLED_EDGE = 0x8a6f4d;
const SLED_FENCE = 0x6e5638;
const SLED_CLAMP = 0x2a2520;

/**
 * A shop-built sled, drawn procedurally with its blade slit at local
 * x = 0 so parking it on the table lines it up with the kerf. The
 * crosscut sled is the classic plywood square with front and back
 * fences; the straight-line sled is a long runner board with toggle
 * clamps that carries a wany edge past the blade.
 */
function buildSled(kind: SledId): Graphics {
  const g = new Graphics();
  if (kind === "crosscutSled") {
    const width = inchesToPixels(16);
    const length = inchesToPixels(18);
    const left = -inchesToPixels(12); // the slit sits 4" in from the right
    const backFence = inchesToPixels(1.2);
    const frontFence = inchesToPixels(2);
    g.rect(left, -length / 2, width, length)
      .fill(SLED_PLY)
      .stroke({ width: 1, color: SLED_EDGE });
    g.rect(left, -length / 2, width, backFence).fill(SLED_FENCE);
    g.rect(left, length / 2 - frontFence, width, frontFence).fill(SLED_FENCE);
    // The kerf slit the blade has already cut through the base
    g.rect(
      -1,
      -length / 2 + backFence,
      2,
      length - backFence - frontFence,
    ).fill({ color: 0x120d08, alpha: 0.55 });
  } else {
    const width = inchesToPixels(8);
    const length = feetToPixels(4);
    g.rect(-width, -length / 2, width, length)
      .fill(SLED_PLY)
      .stroke({ width: 1, color: SLED_EDGE });
    // Toggle clamps along the left edge hold the crooked stock
    for (const at of [-0.32, 0, 0.32]) {
      g.rect(
        -width + inchesToPixels(1),
        at * length - inchesToPixels(0.75),
        inchesToPixels(2.5),
        inchesToPixels(1.5),
      ).fill(SLED_CLAMP);
    }
  }
  return g;
}

/**
 * The jobsite table saw — the old `JobsiteTableSawSprite`: the table
 * with its rip fence riding the rail to the set width, mounted sleds
 * parked in the miter slots, stock feeding along the fence or riding the
 * active sled through the blade, the kerf opening behind the cut, and
 * the blade's three-way spray.
 */
export class JobsiteTableSawArt extends MachineArtBase {
  private readonly holder: Container;
  private readonly parkedSleds = new Container();
  private readonly fenceAssembly = new Container();
  private readonly fenceStock = new Container();
  private readonly fenceSprite: Sprite;
  private readonly sledRide = new Container();
  private readonly kerf: Sprite;

  private readonly fenceX = new Smoothed(0);
  private readonly feedY = new Smoothed(0);
  private cutLength = 0;
  private hasCut = false;
  private firstBuild = true;

  private readonly bladeSpray: CutParticleEmitter;
  private readonly portSpray: CutParticleEmitter;
  private readonly ambientSpray: CutParticleEmitter;

  constructor(machine: Machine) {
    super();
    const [fpX, fpY] = footprintOffset(machine);
    // The blade's teeth come up out of the table spinning toward the
    // operator, kicking dust back over the infeed side; below the table,
    // the guard funnels the rest out the chip port at the back in a
    // tight jet; and fine dust hangs in the air around the blade.
    this.bladeSpray = new CutParticleEmitter({
      kind: "dust",
      x: fpX,
      y: fpY,
      direction: Math.PI / 2,
      density: 1.2,
    });
    this.portSpray = new CutParticleEmitter({
      kind: "dust",
      x: fpX,
      y: fpY - 10,
      direction: -Math.PI / 2,
      spread: 0.5,
    });
    this.ambientSpray = new CutParticleEmitter({
      kind: "dust",
      x: fpX,
      y: fpY,
      direction: 0,
      ambient: true,
      density: 0.7,
    });

    this.holder = footprintContainer(machine);
    this.holder.addChild(
      artSprite("/images/jobsite-table-saw-table.png", IMAGE_SCALE * 0.8),
    );
    this.holder.addChild(this.parkedSleds);

    this.fenceSprite = artSprite(
      "/images/jobsite-table-saw-fence.png",
      IMAGE_SCALE * 0.8,
    );
    this.fenceAssembly.addChild(this.fenceStock);
    this.fenceAssembly.addChild(this.fenceSprite);
    this.holder.addChild(this.fenceAssembly);

    this.holder.addChild(this.sledRide);

    // The kerf: a dark slit that opens behind the blade as the stock
    // feeds through, splitting the already-cut portion in two
    this.kerf = new Sprite(Texture.WHITE);
    this.kerf.tint = 0x120d08;
    this.kerf.alpha = 0.9;
    this.kerf.width = 3;
    this.kerf.anchor.set(0.5, 1);
    this.kerf.visible = false;
    this.holder.addChild(this.kerf);

    this.root.addChild(this.holder);
  }

  rebuild(machine: Machine, activity: MachineActivity): void {
    this.clearContainer(this.parkedSleds);
    this.clearContainer(this.fenceStock);
    this.clearContainer(this.sledRide);

    const { inputMaterials, processingMaterials, outputMaterials } = machine;
    // Boards rip and ride sleds; panels only ever cross on the crosscut sled
    const cutting = processingMaterials.find(
      (material) => isBoard(material) || isPanel(material),
    );

    // Fence-riding cuts are the ones with a fence setting — the rip's
    // width or the resaw's thickness. Everything else rides a jig, and
    // the fence parks out of the way at the end of the rail.
    const runningOperation = machine.selectedOperationOrNull;
    const fenceCut =
      runningOperation != null &&
      operationParameters(runningOperation).some(
        (param) => param.id === "targetWidth" || param.id === "targetThickness",
      );

    // Whether the work stands on edge against the fence is the stock
    // orientation (R turns it over), which also moves the fence to a
    // reading in quarters instead of inches. Work already committed to
    // the blade keeps the orientation of the cut that claimed it.
    const committedWork =
      processingMaterials.length > 0 || outputMaterials.length > 0;
    const resawing = committedWork
      ? machine.state.selectedOperationId === "resawOnTableSaw"
      : stockOrientation(machine) === "on edge";

    // Mounted jigs sit on the table — the mode you can see from across
    // the shop. During a sled cut the active one travels with the stock.
    const mountedSleds = machine.state.tools.filter((tool): tool is SledId =>
      (SLED_TOOLS as readonly string[]).includes(tool),
    );
    const activeSled =
      cutting && !fenceCut
        ? mountedSleds.find((sled) =>
            TOOL_TYPES[sled].operations.some(
              (operation) => operation.id === runningOperation?.id,
            ),
          )
        : undefined;

    // Standing on edge, a board's footprint on the table is its
    // thickness; lying flat it's its width, with the fence face at the
    // near edge.
    const stockOffset = (material: MaterialInstance) => {
      const thickness = "thickness" in material ? material.thickness : 2;
      return resawing
        ? -inchesToPixels(thickness / 8)
        : -inchesToPixels(stockWidth(material) / 2 + thickness / 4);
    };
    const stockSprite = (material: MaterialInstance) =>
      buildMaterialSprite(material, {
        onEdge: resawing && isBoard(material),
      });

    const fenceInches = resawing
      ? Number(machine.selectedParameters?.targetThickness ?? 4) / 4
      : Number(machine.selectedParameters?.targetWidth) ||
        Math.max(...BOARD_DIMENSIONS);
    this.fenceX.target = fenceInches * PIXELS_PER_INCH;
    if (this.firstBuild) this.fenceX.snap(this.fenceX.target);

    // Parked jigs, aligned in the miter slots (slit on the blade line);
    // a second mounted sled stacks askew on top
    mountedSleds.forEach((sled, index) => {
      if (sled === activeSled) return;
      const holder = new Container();
      holder.position.set(
        -inchesToPixels(index * 2),
        inchesToPixels(index * 3),
      );
      holder.angle = index * 4;
      holder.addChild(buildSled(sled));
      this.parkedSleds.addChild(holder);
    });

    // Staged boards lean against the fence on the infeed side
    inputMaterials.filter(isBoard).forEach((board, index) => {
      const holder = new Container();
      holder.angle = resawing ? 0 : index * 10;
      holder.position.set(
        stockOffset(board),
        inchesToPixels(board.length / 2) + inchesToPixels(2),
      );
      const sprite = stockSprite(board);
      if (sprite) holder.addChild(sprite);
      this.fenceStock.addChild(holder);
    });

    // One smoothed value drives the feeding stock (fence or sled side)
    // and the kerf that opens behind the blade (the blade sits at the
    // machine's center).
    this.cutLength = cutting ? inchesToPixels(cutting.length) : 0;
    this.hasCut = cutting !== undefined;
    this.feedY.target = cutting
      ? lerp(
          this.cutLength / 2 + inchesToPixels(2),
          -this.cutLength / 2 - inchesToPixels(3),
          activity.fraction,
        )
      : 0;
    if (this.firstBuild || !cutting) this.feedY.snap(this.feedY.target);

    if (cutting && fenceCut) {
      const holder = new Container();
      holder.x = stockOffset(cutting);
      holder.y = this.feedY.value;
      holder.label = "feeding";
      const sprite = stockSprite(cutting);
      if (sprite) holder.addChild(sprite);
      this.fenceStock.addChild(holder);
    }

    outputMaterials.forEach((material, index) => {
      const length =
        isBoard(material) || isPanel(material) ? material.length : 0.7;
      const holder = new Container();
      holder.angle = resawing ? 0 : -index - 1;
      holder.position.set(
        stockOffset(material) - (resawing ? inchesToPixels(index * 1.2) : 0),
        -inchesToPixels(length / 2) - inchesToPixels(3),
      );
      const sprite = stockSprite(material);
      if (sprite) holder.addChild(sprite);
      this.fenceStock.addChild(holder);
    });

    // A sled cut: the jig travels with the stock clamped to it, the work
    // overhanging the blade line by an inch
    if (cutting && !fenceCut) {
      if (activeSled) this.sledRide.addChild(buildSled(activeSled));
      const holder = new Container();
      holder.x = inchesToPixels(1) - inchesToPixels(stockWidth(cutting) / 2);
      const sprite = buildMaterialSprite(cutting);
      if (sprite) holder.addChild(sprite);
      this.sledRide.addChild(holder);
    }
    this.sledRide.visible = cutting !== undefined && !fenceCut;
    this.kerf.visible = cutting !== undefined;

    this.firstBuild = false;
  }

  override animate(
    dt: number,
    machine: Machine,
    activity: MachineActivity,
    fx: EffectsFrame,
  ): void {
    this.fenceX.update(dt);
    this.feedY.update(dt);
    this.fenceAssembly.x = this.fenceX.value;
    this.sledRide.y = this.feedY.value;
    const feeding = this.fenceStock.getChildByLabel("feeding");
    if (feeding) feeding.y = this.feedY.value;

    if (this.hasCut) {
      const y = this.feedY.value;
      this.kerf.y = Math.min(y + this.cutLength / 2, 0);
      this.kerf.height = Math.max(
        0,
        Math.min(y + this.cutLength / 2, 0) - (y - this.cutLength / 2),
      );
    }

    const cutting = machine.processingMaterials.find(
      (material) => isBoard(material) || isPanel(material),
    );
    const active = cutting !== undefined && activity.working;
    const anyAlive =
      !this.bladeSpray.isEmpty ||
      !this.portSpray.isEmpty ||
      !this.ambientSpray.isEmpty;
    if (cutting || anyAlive) {
      const intensity = cutting ? cutSprayIntensity(machine) : 0;
      const species = cutting ? stockSpecies(cutting) : "pine";
      this.bladeSpray.update(dt, active, intensity, species, fx);
      this.portSpray.update(dt, active, intensity, species, fx);
      this.ambientSpray.update(dt, active, intensity, species, fx);
    }
  }
}
