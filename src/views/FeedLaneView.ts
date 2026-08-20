import { Graphics } from "pixi.js";
import { Persistence } from "../config/constants";
import { BaseEntity } from "../core/entity/BaseEntity";
import { Entity } from "../core/entity/Entity";
import { GameSprite } from "../core/entity/GameSprite";
import { on } from "../core/entity/handler";
import { shopCellMap } from "../sim/commands/machine-commands";
import { feedClearanceShortfall, feedLaneCells } from "../game/feed-clearance";
import { findFeedableOperation } from "../game/machine-helpers";
import { availableOperations } from "../game/skill-helpers";
import { Vector } from "../game/Vectors";
import { TargetingState } from "../shell/dispatch/TargetingState";
import { Player } from "../sim/entities/Player";
import { projectGameState } from "../sim/projection";
import { PIXELS_PER_CELL } from "./shop-scale";

/**
 * The feed lane long stock would need when the targeted machine is
 * refusing a cut for room — the old FeedLaneLayer as a view entity: the
 * run each side of the machine painted on the floor, with the cells in
 * the way (a machine, the wall) in red. Only drawn while there's a
 * shortfall; a cut with room just runs, and the floor stays quiet.
 *
 * Render-only, and on the "effects" layer so the paint reads over the
 * machines it's measuring past.
 */

/** Cells the stock can travel over. */
const CLEAR = 0x22c55e;
/** Cells in the way. */
const BLOCKED = 0xef4444;
const PAINT_ALPHA = 0.28;

export class FeedLaneView extends BaseEntity implements Entity {
  persistenceLevel: number = Persistence.Level;
  pausable = false;

  private paint: Graphics & GameSprite;
  /** The lane the floor currently shows, so a held refusal draws once. */
  private drawnFor = "";

  constructor() {
    super();
    this.paint = new Graphics() as Graphics & GameSprite;
    this.paint.layerName = "effects";
    this.paint.eventMode = "none";
    this.sprite = this.paint;
  }

  @on("render")
  onRender() {
    const lane = this.currentLane();
    const key = lane
      ? [
          ...lane.clear.map((cell) => `c${cell[0]},${cell[1]}`),
          ...lane.blocked.map((cell) => `b${cell[0]},${cell[1]}`),
        ].join("|")
      : "";
    if (key === this.drawnFor) return;
    this.drawnFor = key;

    const g = this.paint;
    g.clear();
    if (!lane) return;
    this.paintCells(lane.clear, CLEAR);
    this.paintCells(lane.blocked, BLOCKED);
  }

  /**
   * The lane to paint right now, or null when nothing is being refused.
   * It advises on what's already on the machine if anything, else what's
   * in hand — the same stock the refusal chip is explaining (the HUD's
   * MachineChips), so the floor and the chip never disagree.
   */
  private currentLane(): { clear: Vector[]; blocked: Vector[] } | null {
    const game = this.game;
    if (!game.entities.tryGetSingleton(Player)) return null;
    const targeted = game.entities.tryGetSingleton(TargetingState)?.targeted();
    if (!targeted || !targeted.type.feedsThrough) return null;

    const machine = targeted.view();
    const gameState = projectGameState(game);
    if (gameState.player.away) return null;

    const stock =
      machine.inputMaterials.length > 0
        ? machine.inputMaterials
        : gameState.player.inventory;
    if (stock.length === 0) return null;

    const cellMap = shopCellMap(game);
    const match = findFeedableOperation(
      machine,
      availableOperations(machine, gameState.progression),
      stock,
    );
    if (!match) return null;
    const shortfall = feedClearanceShortfall(machine, match.materials, cellMap);
    if (!shortfall) return null;
    return feedLaneCells(machine, cellMap, shortfall.lengthIn);
  }

  private paintCells(cells: ReadonlyArray<Vector>, color: number): void {
    for (const [x, y] of cells) {
      this.paint.rect(
        x * PIXELS_PER_CELL,
        y * PIXELS_PER_CELL,
        PIXELS_PER_CELL,
        PIXELS_PER_CELL,
      );
      this.paint.fill({ color, alpha: PAINT_ALPHA });
    }
  }
}
