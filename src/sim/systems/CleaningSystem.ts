import { Persistence } from "../../config/constants";
import { TickLayerName } from "../../config/tickLayers";
import { BaseEntity } from "../../core/entity/BaseEntity";
import { Entity } from "../../core/entity/Entity";
import { on } from "../../core/entity/handler";
import { cellDust, dustSlowdown } from "../../game/Dust";
import { sweepTickPass } from "../../game/game-actions/dust-actions";
import {
  shopVacTickPass,
  vacuumTickPass,
} from "../../game/game-actions/shop-vac-actions";
import { heldTool } from "../../game/HeldTool";
import { personCanWork } from "../../game/Person";
import { SWEEPING_PENALTY } from "../../game/player-motion";
import { SHOP_VAC_DRAG_PENALTY } from "../../game/ShopVac";
import { Player } from "../entities/Player";
import { ShopVacEntity } from "../entities/ShopVacEntity";
import { projectGameState } from "../projection";
import { Broom } from "../singletons/Broom";
import { DustLayer } from "../singletons/DustLayer";
import { Progression } from "../singletons/Progression";
import { TimeFlow } from "../TimeFlow";

/**
 * The cleaning slice of the sim tick: the broom's sweep, the vac's
 * suction, and the vac's passive trickle, in the old pipeline's order
 * (sweep → vacuum → shopVac), one pass per sim minute on the "cleaning"
 * layer — before machines emit this minute's dust, so cleaning always
 * clears the floor as of last minute.
 *
 * Unlike the MachineSystem (whose state lives spread across per-machine
 * entities), the cleaning passes read and write a handful of singleton
 * slices — the dust map, the dustpan, the vac's canister, sweeping XP —
 * so the minute pass reuses the old world's pure passes wholesale: build
 * a projection snapshot, run `sweepTickPass` / `vacuumTickPass` /
 * `shopVacTickPass` over it, and write the slices they own back onto
 * their entities. Parity is by construction — the passes ARE the
 * reference implementation. The passes never touch `busyTicks` (sweeping
 * deliberately doesn't freeze the feet) and emit no sounds, so nothing
 * else writes back.
 *
 * The system also carries the cleaning half of the time model and the
 * walk-speed penalties:
 *  - a held tool worked by the operate key spends the player's time (the
 *    `heldTool` branch of the old `timeSpeed`), registered with TimeFlow
 *    as a spender — the busy-body spender is the Player's own;
 *  - deep sawdust underfoot, a dragged vac, and an active sweep slow the
 *    walk (the old `playerWalkSpeed`), registered as speed penalties on
 *    the Player. A load rebuilds the Player entity, so the penalties are
 *    re-registered from `beforeTick` (which runs before the player
 *    layer's movement) whenever the instance changes.
 *
 * Transient — never serialized; added per session by the bootstrap.
 */
export class CleaningSystem extends BaseEntity implements Entity {
  id = "cleaningSystem";
  tickLayer: TickLayerName = "cleaning";
  persistenceLevel: number = Persistence.Permanent;

  private unregisterSpender: (() => void) | null = null;
  /** The Player instance the speed penalties are registered on. */
  private penalizedPlayer: Player | null = null;

  @on("afterAdded")
  onAfterAdded() {
    const timeFlow = this.game.entities.tryGetSingleton(TimeFlow);
    if (timeFlow) {
      this.unregisterSpender = timeFlow.registerSpender(() =>
        this.heldToolSpendsTime(),
      );
    }
  }

  @on("destroy")
  onDestroy() {
    this.unregisterSpender?.();
    this.unregisterSpender = null;
  }

  @on("beforeTick")
  onBeforeTick() {
    this.ensureSpeedPenalties();
  }

  @on("tick")
  onTick() {
    const timeFlow = this.game.entities.tryGetSingleton(TimeFlow);
    const minutes = timeFlow?.wholeTicks ?? 0;
    for (let i = 0; i < minutes; i++) {
      this.minutePass();
    }
  }

  /**
   * Whether a held cleaning tool is consuming the player's time — the
   * broom/vac branch of the old `timeSpeed`: the operate key held with a
   * tool in hand and the player free to work.
   */
  heldToolSpendsTime(): boolean {
    const gameState = projectGameState(this.game);
    return (
      gameState.player.operating === true &&
      heldTool(gameState) !== null &&
      personCanWork(gameState.player)
    );
  }

  /** One sim minute of cleaning: the three old passes, written back. */
  private minutePass(): void {
    const before = projectGameState(this.game);
    const after = shopVacTickPass()(vacuumTickPass()(sweepTickPass()(before)));
    if (after === before) {
      return;
    }

    if (after.dust !== before.dust) {
      const dustLayer = this.game.entities.tryGetSingleton(DustLayer);
      if (dustLayer) {
        dustLayer.map = after.dust;
      }
    }
    if (after.dustpan !== before.dustpan) {
      const broom = this.game.entities.tryGetSingleton(Broom);
      if (broom) {
        broom.dustpan = after.dustpan;
        this.game.dispatch("cleaningChanged", {});
      }
    }
    if (after.shopVac !== before.shopVac && after.shopVac) {
      const vac = this.game.entities.tryGetSingleton(ShopVacEntity);
      if (vac) {
        vac.position = after.shopVac.position;
        vac.canister = after.shopVac.canister;
        this.game.dispatch("cleaningChanged", {});
      }
    }
    if (after.progression !== before.progression) {
      // The passes grant XP through the shared withXp, which also banks
      // the level-ups; copy both results back.
      const progression = this.game.entities.getSingleton(Progression);
      progression.xp = after.progression.xp;
      progression.skillPoints = after.progression.skillPoints;
      this.game.dispatch("progressionChanged", {});
    }
  }

  /**
   * Register the walk-speed penalties on the current Player instance —
   * once per instance; a save load rebuilds the Player and its old
   * registrations die with it.
   */
  private ensureSpeedPenalties(): void {
    const player = this.game.entities.tryGetSingleton(Player);
    if (!player || player === this.penalizedPlayer) {
      return;
    }
    // Deep sawdust underfoot: the same ramp that slows a buried machine.
    player.registerSpeedPenalty(() => {
      const dustLayer = this.game.entities.tryGetSingleton(DustLayer);
      return dustLayer ? dustSlowdown(cellDust(dustLayer.map, player.cell)) : 0;
    });
    // Dragging the vac's canister costs an extra tick-equivalent per step.
    player.registerSpeedPenalty(() => {
      const vac = this.game.entities.tryGetSingleton(ShopVacEntity);
      return vac?.inHand ? SHOP_VAC_DRAG_PENALTY : 0;
    });
    // Actively plowing dust has heft — you walk, but not at full stride.
    player.registerSpeedPenalty(() => {
      const broom = this.game.entities.tryGetSingleton(Broom);
      return broom?.inHand && player.operating ? SWEEPING_PENALTY : 0;
    });
    this.penalizedPlayer = player;
  }
}
