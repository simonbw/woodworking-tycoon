import { Container, Graphics, Text } from "pixi.js";
import { cellToPixel, PIXELS_PER_CELL } from "./shop-scale";
import { BaseEntity } from "../core/entity/BaseEntity";
import { Entity } from "../core/entity/Entity";
import { GameSprite } from "../core/entity/GameSprite";
import { on } from "../core/entity/handler";
import { CellMap } from "../game/CellMap";
import { shopCellMap } from "../sim/commands/machine-commands";
import { FeedRunRuler, feedRunRulers } from "../game/feed-clearance";
import {
  canPlaceMachine,
  carriedMachinePlacement,
} from "../game/game-actions/machine-actions";
import { Machine, MachineState, MACHINE_TYPES } from "../game/Machine";
import { Vector } from "../game/Vectors";
import { Player } from "../sim/entities/Player";
import { projectGameState } from "../sim/projection";
import { createMachineArt } from "./machine-sprites/create-machine-art";
import { IDLE_ACTIVITY } from "./machine-sprites/machine-activity";
import {
  EffectsFrame,
  footprintOffset,
  MachineArtBase,
} from "./machine-sprites/machine-art";
import { drawDustBag } from "./machine-sprites/machine-chrome";

/**
 * Everything drawn while the player is lugging a machine — the old
 * `CarriedMachineLayer`: the machine riding over their shoulders, and a
 * ghost of where it would land — the player stands at the operator cell
 * and sets it down in front of them (see carriedMachinePlacement). White
 * means it fits, red means no room. A feed-through machine's ghost also
 * wears its chalk feed-run rulers, so a spot can be judged before the
 * machine lands.
 *
 * Spawned as a child of PlayerView, reading the Player singleton; all
 * three pieces ride the "carried" layer, above the bodies. The carried
 * load tracks the continuous body frame by frame.
 */

/** Further than any lane in the shop can run. */
const RULER_CAP = 30;

/** T-cap half-height, line-to-label gap, and type size, in world px. */
const TICK = PIXELS_PER_CELL * 0.18;
const LABEL_OFFSET = PIXELS_PER_CELL * 0.3;
const FONT_SIZE = 15;

const CHALK = 0xf5f0e8;
const SHADOW = 0x1a1a1a;

export class CarriedMachineView extends BaseEntity implements Entity {
  private readonly ghostHolder: Container & GameSprite;
  private readonly rulerHolder: Container & GameSprite;
  private readonly rulerGraphics = new Graphics();
  private readonly rulerLabels: [Text, Text];
  private readonly carriedHolder: Container & GameSprite;
  private readonly carriedRotated = new Container();

  private carriedArt: MachineArtBase | null = null;
  private lastCarried: MachineState | null = null;
  private ghostArt: MachineArtBase | null = null;
  private ghostKey = "";

  /** Nothing sprays off an idle carried machine; animate still runs so
   * settings-driven poses (a swung miter head) hold their positions. */
  private readonly dummyFx: EffectsFrame = {
    graphics: new Graphics(),
    toWorld: (x, y) => [x, y],
  };

  constructor(private readonly player: Player) {
    super();
    this.ghostHolder = new Container() as Container & GameSprite;
    this.ghostHolder.layerName = "carried";
    this.ghostHolder.alpha = 0.6;

    this.rulerHolder = new Container() as Container & GameSprite;
    this.rulerHolder.layerName = "carried";
    this.rulerHolder.addChild(this.rulerGraphics);
    this.rulerLabels = [this.makeLabel(), this.makeLabel()];
    this.rulerHolder.addChild(...this.rulerLabels);

    this.carriedHolder = new Container() as Container & GameSprite;
    this.carriedHolder.layerName = "carried";
    // The machine hovers shrunken over the shoulders carrying it
    const lifted = new Container();
    lifted.scale.set(0.45);
    lifted.y = -PIXELS_PER_CELL * 0.3;
    lifted.addChild(this.carriedRotated);
    this.carriedHolder.addChild(lifted);

    this.sprites = [this.ghostHolder, this.rulerHolder, this.carriedHolder];
  }

  private makeLabel(): Text {
    return new Text({
      text: "",
      anchor: 0.5,
      resolution: 4,
      style: {
        fontFamily: "Barlow Condensed",
        fontWeight: "600",
        fontSize: FONT_SIZE,
        fill: CHALK,
        stroke: { color: SHADOW, width: 2.5 },
      },
    });
  }

  @on("render")
  onRender(dt: number) {
    const carried = this.player.carriedMachine;
    const show = carried !== null && this.player.away === null;
    this.carriedHolder.visible = show;
    this.ghostHolder.visible = false;
    this.rulerHolder.visible = false;
    if (!show) {
      this.lastCarried = null;
      return;
    }

    // Ride the continuous body directly — the load tracks the shoulders
    // it's on, frame by frame.
    this.carriedHolder.position.set(
      cellToPixel(this.player.position[0]),
      cellToPixel(this.player.position[1]),
    );

    if (carried !== this.lastCarried) {
      this.lastCarried = carried;
      this.rebuildCarried(carried);
    }
    this.carriedArt?.animate(
      dt,
      new Machine({ ...carried, position: [0, 0] }),
      IDLE_ACTIVITY,
      this.dummyFx,
    );

    // The ghost of where the machine would land, and its feed rulers
    const gameState = projectGameState(this.game);
    const placement = carriedMachinePlacement(gameState);
    if (!placement) return;
    const cellMap = shopCellMap(this.game);
    if (!cellMap.has(placement.position)) return;

    const isValid = canPlaceMachine(
      cellMap,
      placement.machineType,
      placement.position,
      placement.rotation,
    );
    this.ghostHolder.visible = true;
    this.ghostHolder.tint = isValid ? 0xffffff : 0xff6666;

    const key = `${carried.machineTypeId}|${placement.position}|${placement.rotation}`;
    const ghostState = this.ghostState(carried, placement);
    const ghost = new Machine(ghostState);
    if (key !== this.ghostKey) {
      this.ghostKey = key;
      this.rebuildGhost(ghost);
      this.drawRulers(ghost, cellMap);
    }
    this.rulerHolder.visible = true;
    this.ghostArt?.animate(dt, ghost, IDLE_ACTIVITY, this.dummyFx);
  }

  /** The old MachineGhostPreview's temporary machine state. */
  private ghostState(
    carried: MachineState,
    placement: { position: Vector; rotation: MachineState["rotation"] },
  ): MachineState {
    const machineType = MACHINE_TYPES[carried.machineTypeId];
    return {
      machineTypeId: carried.machineTypeId,
      position: placement.position,
      rotation: placement.rotation,
      selectedOperationId:
        machineType.operations.length > 0
          ? machineType.operations[0].id
          : "none",
      operationProgress: {
        status: "notStarted",
        phaseIndex: 0,
        ticksRemaining: 0,
      },
      inputMaterials: [],
      processingMaterials: [],
      outputMaterials: [],
      tools: [],
    };
  }

  private rebuildCarried(carried: MachineState): void {
    this.carriedRotated
      .removeChildren()
      .forEach((child) => child.destroy({ children: true }));
    const machine = new Machine({ ...carried, position: [0, 0] });
    this.carriedArt = createMachineArt(machine);
    this.carriedArt.rebuild(machine, IDLE_ACTIVITY);
    this.carriedRotated.angle = carried.rotation * -90;
    this.carriedRotated.addChild(this.carriedArt.root);
    // A mounted dust bag rides along
    if (carried.tools.includes("dustBag")) {
      const bag = new Graphics();
      drawDustBag(bag);
      const [fpX, fpY] = footprintOffset(machine);
      bag.position.set(fpX, fpY);
      this.carriedRotated.addChild(bag);
    }
  }

  private rebuildGhost(ghost: Machine): void {
    this.ghostHolder
      .removeChildren()
      .forEach((child) => child.destroy({ children: true }));
    this.ghostArt = createMachineArt(ghost);
    this.ghostArt.rebuild(ghost, IDLE_ACTIVITY);
    const [x, y] = [
      cellToPixel(ghost.position[0] + 0.5),
      cellToPixel(ghost.position[1] + 0.5),
    ];
    const positioned = new Container();
    positioned.position.set(x, y);
    positioned.angle = ghost.rotation * -90;
    positioned.addChild(this.ghostArt.root);
    this.ghostHolder.addChild(positioned);
  }

  /**
   * Chalk dimension lines along a feed-through machine's lane: how many
   * feet of clear run each side has, drawn as a measurement line with
   * T-ends and the footage at its middle — the old FeedRunRulerLayer,
   * against the set-down ghost. A side with no run at all keeps just its
   * end tick and a 0'.
   */
  private drawRulers(machine: Machine, cellMap: CellMap): void {
    const g = this.rulerGraphics;
    g.clear();
    const rulers = feedRunRulers(machine, cellMap, RULER_CAP);
    if (!rulers) {
      for (const label of this.rulerLabels) label.visible = false;
      return;
    }
    [rulers.infeed, rulers.outfeed].forEach((side, i) => {
      const { start, end, perp, label, run } = sideGeometry(side);
      const segments: Array<[Vector, Vector]> = [
        [start, end],
        [
          [start[0] - perp[0] * TICK, start[1] - perp[1] * TICK],
          [start[0] + perp[0] * TICK, start[1] + perp[1] * TICK],
        ],
        [
          [end[0] - perp[0] * TICK, end[1] - perp[1] * TICK],
          [end[0] + perp[0] * TICK, end[1] + perp[1] * TICK],
        ],
      ];
      // Twice over: a soft dark underlay so the chalk reads on a pale
      // slab, then the chalk line itself
      for (const [width, color, alpha] of [
        [4, SHADOW, 0.3],
        [1.5, CHALK, 0.9],
      ] as const) {
        for (const [from, to] of segments) {
          g.moveTo(from[0], from[1]);
          g.lineTo(to[0], to[1]);
        }
        g.stroke({ width, color, alpha, cap: "round" });
      }

      const text = this.rulerLabels[i];
      text.visible = true;
      text.text = `${run}'`;
      text.position.set(label[0], label[1]);
    });
  }
}

interface SideGeometry {
  start: Vector;
  end: Vector;
  perp: Vector;
  label: Vector;
  run: number;
}

/**
 * Where one side's dimension line sits, in world pixels: from the
 * footprint's edge out to the end of the clear run, along the middle of
 * the lane, with the label off to a consistent side (above a horizontal
 * lane, left of a vertical one).
 */
function sideGeometry(side: FeedRunRuler): SideGeometry {
  const [dx, dy] = side.direction;
  const start: Vector = [
    (side.edgeCell[0] + 0.5 + dx * 0.5) * PIXELS_PER_CELL,
    (side.edgeCell[1] + 0.5 + dy * 0.5) * PIXELS_PER_CELL,
  ];
  const end: Vector = [
    start[0] + dx * side.run * PIXELS_PER_CELL,
    start[1] + dy * side.run * PIXELS_PER_CELL,
  ];
  let perp: Vector = [-dy, dx];
  if (perp[1] > 0 || (perp[1] === 0 && perp[0] > 0)) {
    perp = [-perp[0], -perp[1]];
  }
  const label: Vector = [
    (start[0] + end[0]) / 2 + perp[0] * LABEL_OFFSET,
    (start[1] + end[1]) / 2 + perp[1] * LABEL_OFFSET,
  ];
  return { start, end, perp, label, run: side.run };
}
