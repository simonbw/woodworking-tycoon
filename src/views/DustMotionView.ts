import { Graphics } from "pixi.js";
import { Persistence } from "../config/constants";
import { BaseEntity } from "../core/entity/BaseEntity";
import { Entity } from "../core/entity/Entity";
import { GameSprite } from "../core/entity/GameSprite";
import { on } from "../core/entity/handler";
import { DustMap, dustTotal } from "../game/Dust";
import { SWEEP_AIM_REACH } from "../game/game-actions/dust-actions";
import { headingForDirection } from "../game/player-motion";
import { chebyshevDistance } from "../game/Vectors";
import { MachineEntity } from "../sim/entities/MachineEntity";
import { Player } from "../sim/entities/Player";
import { ShopVacEntity } from "../sim/entities/ShopVacEntity";
import { Broom } from "../sim/singletons/Broom";
import { DustLayer } from "../sim/singletons/DustLayer";
import { mixColors } from "../utils/colorUtils";
import { rUniform } from "../utils/randUtils";
import { dustLosses, gatherMoteCount, pourMoteCount } from "./dust-motes";
import { PlayerView } from "./PlayerView";
import { cellToPixel, cellToPixelCenter, PIXELS_PER_CELL } from "./shop-scale";
import { findChildView } from "./targetHighlight";

/**
 * The dust in the air — the old DustMotionLayer as a view entity.
 * Whenever a floor cell loses dust (a broom stroke, the vac's suction,
 * the drag-past trickle) it throws a burst of species-colored flecks
 * that fly into the tool doing the taking; emptying the pan or the
 * canister pours a stream into the garbage can.
 *
 * The sim's DustLayer is the ledger and DustView bakes it into the
 * floor; this is the motion between the entries. Render-only: it watches
 * the dust map, the dustpan, and the canister, and never writes.
 */

/** Where the broom head rides ahead of the body, in cells. */
const BROOM_REACH = 1.3;
/** Where the nozzle tip rides ahead of the body, in cells. */
const NOZZLE_REACH = 0.9;

interface DustParticle {
  /** Spawn point, world px. */
  x: number;
  y: number;
  /** Random tumble applied on top of the homing ease. */
  driftX: number;
  driftY: number;
  life: number;
  maxLife: number;
  size: number;
  color: number;
  /** Fly into the tool, or pour downward (emptying at the can). */
  kind: "gather" | "pour";
  /** For pours: the fixed point to fall toward. */
  targetX: number;
  targetY: number;
}

export class DustMotionView extends BaseEntity implements Entity {
  persistenceLevel: number = Persistence.Level;

  private motes: Graphics & GameSprite;
  private particles: DustParticle[] = [];
  /** The dust map the last frame's spawns were measured against. */
  private prevMap: DustMap | null = null;
  /** Pan + canister contents last frame, for spotting a pour. */
  private prevHeld = 0;

  constructor() {
    super();
    this.motes = new Graphics() as Graphics & GameSprite;
    // Above the bodies, with the carried load: the flecks fly over the
    // player, not under them.
    this.motes.layerName = "carried";
    this.sprite = this.motes;
  }

  @on("render")
  onRender(rawDt: number) {
    const g = this.motes;
    g.clear();

    const player = this.game.entities.tryGetSingleton(Player);
    if (!player) {
      this.particles = [];
      return;
    }
    const dt = Math.min(rawDt, 0.1);

    this.spawnFromFloor();
    this.spawnPour(player);
    const [toolX, toolY] = this.toolPoint(player);
    this.drawParticles(g, dt, toolX, toolY);
  }

  /** Bursts from the floor cells that lost dust since the last frame. */
  private spawnFromFloor(): void {
    const next = this.game.entities.tryGetSingleton(DustLayer)?.map ?? {};
    const prev = this.prevMap;
    this.prevMap = next;
    // First frame: the floor as found is the baseline, not a sweep.
    if (prev === null || prev === next) return;

    for (const { cell, lost, color } of dustLosses(prev, next)) {
      const count = gatherMoteCount(lost, this.particles.length);
      for (let i = 0; i < count; i++) {
        this.particles.push({
          x: (cell[0] + rUniform(0.1, 0.9)) * PIXELS_PER_CELL,
          y: (cell[1] + rUniform(0.1, 0.9)) * PIXELS_PER_CELL,
          driftX: rUniform(-30, 30),
          // Biased upward: a stroke kicks dust up before it settles
          // into the pan or the nozzle
          driftY: rUniform(-45, 5),
          life: 0,
          maxLife: rUniform(0.3, 0.55),
          size: rUniform(3, 5.5),
          // Airborne dust catches the light — noticeably paler than
          // the drift it just left, or it vanishes against it
          color: mixColors(color, 0xffffff, rUniform(0.3, 0.55)),
          kind: "gather",
          targetX: 0,
          targetY: 0,
        });
      }
    }
  }

  /** The stream while the pan or the canister empties at the can. */
  private spawnPour(player: Player): void {
    const broom = this.game.entities.tryGetSingleton(Broom);
    const vac = this.game.entities.tryGetSingleton(ShopVacEntity);
    const held = dustTotal(broom?.dustpan) + dustTotal(vac?.canister);
    const poured = this.prevHeld - held;
    this.prevHeld = held;
    if (poured <= 1e-6) return;

    const can = [...this.game.entities.byConstructor(MachineEntity)].find(
      (entity) => entity.type.id === "garbageCan",
    );
    if (!can) return;

    const [canX, canY] = cellToPixelCenter(can.state.position);
    const handX = cellToPixel(player.position[0]);
    const handY = cellToPixel(player.position[1]);
    const count = pourMoteCount(poured, this.particles.length);
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: handX + rUniform(-6, 6),
        y: handY + rUniform(-10, 2),
        driftX: rUniform(-15, 15),
        driftY: rUniform(-10, 10),
        life: 0,
        maxLife: rUniform(0.25, 0.4),
        size: rUniform(1.6, 3.2),
        color: mixColors(0xa8895c, 0xffffff, rUniform(0, 0.3)),
        kind: "pour",
        targetX: canX + rUniform(-8, 8),
        targetY: canY + rUniform(-6, 6),
      });
    }
  }

  /**
   * The live point gathered flecks home toward: the aimed cell while the
   * mouse is steering the broom, otherwise the tool head riding ahead of
   * the body — the nozzle sits closer in than the bristles.
   */
  private toolPoint(player: Player): [number, number] {
    const broom = this.game.entities.tryGetSingleton(Broom);
    const vac = this.game.entities.tryGetSingleton(ShopVacEntity);
    const aim = player.sweepAim;
    if (
      broom?.inHand &&
      aim != null &&
      chebyshevDistance(aim, player.cell) <= SWEEP_AIM_REACH
    ) {
      return [
        (aim[0] + 0.5) * PIXELS_PER_CELL,
        (aim[1] + 0.5) * PIXELS_PER_CELL,
      ];
    }
    const reach = vac?.inHand ? NOZZLE_REACH : BROOM_REACH;
    // The body's eased heading, so the flecks land on the tool the
    // player can actually see rather than on the snapped facing.
    const view = findChildView(player, PlayerView);
    const heading =
      view != null
        ? view.bodyRotation - Math.PI / 2
        : headingForDirection(player.direction);
    return [
      cellToPixel(player.position[0]) +
        Math.cos(heading) * reach * PIXELS_PER_CELL,
      cellToPixel(player.position[1]) +
        Math.sin(heading) * reach * PIXELS_PER_CELL,
    ];
  }

  /** Integrate every live fleck one frame and draw what's left. */
  private drawParticles(
    g: Graphics,
    dt: number,
    toolX: number,
    toolY: number,
  ): void {
    this.particles = this.particles.filter((particle) => {
      particle.life += dt;
      if (particle.life >= particle.maxLife) return false;
      const t = particle.life / particle.maxLife;
      const ease = t * t * (3 - 2 * t);
      const targetX = particle.kind === "gather" ? toolX : particle.targetX;
      const targetY = particle.kind === "gather" ? toolY : particle.targetY;
      const drawX =
        particle.x +
        (targetX - particle.x) * ease +
        particle.driftX * t * (1 - t);
      const drawY =
        particle.y +
        (targetY - particle.y) * ease +
        particle.driftY * t * (1 - t);
      g.rect(
        drawX - particle.size / 2,
        drawY - particle.size / 2,
        particle.size,
        particle.size,
      );
      g.fill({ color: particle.color, alpha: 0.95 * (1 - t * 0.5) });
      return true;
    });
  }
}
