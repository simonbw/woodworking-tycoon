import { Persistence } from "../../config/constants";
import { TickLayerName } from "../../config/tickLayers";
import { BaseEntity } from "../../core/entity/BaseEntity";
import { Entity } from "../../core/entity/Entity";
import { on } from "../../core/entity/handler";
import { truckCabSideCell } from "../../game/lot";
import { cellCenter } from "../../game/player-motion";
import { Player } from "../entities/Player";
import { Clock } from "../singletons/Clock";
import { ShopInfo } from "../singletons/ShopInfo";
import { TimeFlow } from "../TimeFlow";

/**
 * The overnight batch: the NIGHT_TICKS sim minutes between driving home
 * and waking up, run one minute at a time.
 *
 * Commands must never drive the engine (`game.step` from inside a
 * command would re-enter the tick), so waking up is split in two: the
 * `beginWakeUp` command validates, turns the day over, and hands this
 * system the night's minutes; the caller then keeps stepping the engine
 * (the driver's `sleep()`, or the shell's ordinary frame loop) while
 * this system feeds `TimeFlow.forceMinutes(1)` once per engine tick —
 * one sim minute per engine tick, so the per-minute interleaving of the
 * sim layers (player → cleaning → machines → clock → street →
 * milestones) is the same overnight as it is by day. `forceMinutes`
 * bypasses the pace model on purpose: the
 * player home in bed is TimeFlow's hard stop, and the overnight is
 * precisely the minutes that pass anyway.
 *
 * It runs on the "main" layer, after every sim layer of the same engine
 * tick: a minute fed at the end of tick N is processed by the sim layers
 * during tick N+1, and the tick after the last minute has fully run, the
 * morning lands in one piece — the day number, a fresh `dayStartTick`,
 * the player back beside the truck's cab, `away` cleared. Night checks
 * during the batch read the old `dayStartTick`, so a player who slept
 * early sees the tail of the day pass before the street empties, exactly
 * as the old batch did.
 *
 * **The night is atomic.** Its own progress — how many minutes are left
 * to feed — is deliberately not persisted, so the invariant that makes
 * that safe is that no save is ever taken part-way through: the
 * SaveManager holds writes while `overnightPending`, and every scrap of
 * day-turnover bookkeeping happens in the single tick that ends the
 * batch. A snapshot therefore shows one of exactly two shops — the
 * evening before, asleep at home on day D, or the morning after, awake
 * beside the cab on day D+1. Reloading the evening one simply runs the
 * night again. Move any of that bookkeeping earlier and a crash or a
 * closed tab mid-night costs a day and cures a second night's glue.
 *
 * Transient — never serialized; added per session by the bootstrap.
 */
export class SleepSystem extends BaseEntity implements Entity {
  id = "sleepSystem";
  tickLayer: TickLayerName = "main";
  persistenceLevel: number = Persistence.Permanent;

  /** Night minutes not yet handed to TimeFlow. */
  private minutesToFeed = 0;
  /** Whether an overnight batch is running right now. */
  private sleeping = false;

  /** Whether an overnight is underway (begun and not yet finished). */
  get overnightPending(): boolean {
    return this.sleeping;
  }

  /** Queue an overnight of this many sim minutes. beginWakeUp's half. */
  begin(minutes: number): void {
    this.sleeping = true;
    this.minutesToFeed = minutes;
  }

  @on("tick")
  onTick() {
    if (!this.sleeping) {
      return;
    }
    if (this.minutesToFeed > 0) {
      // Fed now, processed by every sim layer on the next engine tick.
      const timeFlow = this.game.entities.getSingleton(TimeFlow);
      timeFlow.forceMinutes(1);
      this.minutesToFeed -= 1;
      return;
    }
    // The last minute has run through every sim layer this tick (the
    // "main" layer comes after them all) — morning, all of it at once.
    this.sleeping = false;
    const clock = this.game.entities.getSingleton(Clock);
    clock.day += 1;
    clock.dayStartTick = clock.tick;
    const player = this.game.entities.getSingleton(Player);
    const shopInfo = this.game.entities.getSingleton(ShopInfo);
    player.away = null;
    player.position = cellCenter(truckCabSideCell(shopInfo.info));
    this.game.dispatch("playerChanged", {});
  }
}
