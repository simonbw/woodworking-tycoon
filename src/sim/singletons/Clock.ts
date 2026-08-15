import { z } from "zod";
import { Persistence } from "../../config/constants";
import { TickLayerName } from "../../config/tickLayers";
import { BaseEntity } from "../../core/entity/BaseEntity";
import { Entity } from "../../core/entity/Entity";
import { on } from "../../core/entity/handler";
import { dayPhase, DayPhase, TICKS_PER_DAY } from "../../game/time";
import {
  registerSerializable,
  SerializableEntity,
} from "../save/serialization";
import { TimeFlow } from "../TimeFlow";

/**
 * The shop clock: which game minute it is, which calendar day, and when
 * this morning started.
 *
 * One game tick is one shop minute (see `src/game/time.ts` — the units
 * are shared with the old world). Each engine tick the clock draws
 * `gameDt` game minutes from TimeFlow and carries whole minutes into
 * `tick`; sim systems that think in whole minutes read `tick`, and the
 * fractional remainder is persisted so a save can land between minutes
 * without losing the carry.
 *
 * The day advances only by sleeping — the drive home sets a new
 * `dayStartTick` and bumps `day` — never by the tick counter rolling
 * over (the same rule as the old world's time-flow.ts).
 */

const schema = z.object({
  tick: z.number().int(),
  day: z.number().int(),
  dayStartTick: z.number().int(),
  /** Game minutes accrued toward the next tick, in [0, 1). */
  fraction: z.number(),
});

type ClockData = z.infer<typeof schema>;

export class Clock extends BaseEntity implements Entity, SerializableEntity {
  readonly saveType = "clock";
  id = "clock";
  tickLayer: TickLayerName = "clock";
  persistenceLevel: number = Persistence.Game;

  tick: number;
  day: number;
  dayStartTick: number;
  fraction: number;

  constructor(data: Partial<ClockData> = {}) {
    super();
    this.tick = data.tick ?? 0;
    this.day = data.day ?? 1;
    this.dayStartTick = data.dayStartTick ?? 0;
    this.fraction = data.fraction ?? 0;
  }

  /** How many of today's working minutes have been spent. */
  dayTicksSpent(): number {
    return this.tick - this.dayStartTick;
  }

  /** Where today stands, morning through night. */
  currentDayPhase(): DayPhase {
    return dayPhase(this.dayTicksSpent());
  }

  /**
   * Whether the shop is closed for the night: the day's budget is spent.
   * Nothing new starts and idle time stops passing; only work already
   * running (or the drive home) moves the world.
   */
  isNight(): boolean {
    return this.dayTicksSpent() >= TICKS_PER_DAY;
  }

  /** Advance the clock by a span of game minutes, carrying whole ticks. */
  advance(gameMinutes: number): void {
    this.fraction += gameMinutes;
    while (this.fraction >= 1) {
      this.fraction -= 1;
      this.tick += 1;
    }
  }

  @on("afterAdded")
  onAfterAdded() {
    // The clock is what knows night; TimeFlow asks it when resolving pace.
    const timeFlow = this.game.entities.tryGetSingleton(TimeFlow);
    timeFlow?.setNightProvider(() => this.isNight());
  }

  @on("tick")
  onTick() {
    const timeFlow = this.game.entities.getById("timeFlow") as
      TimeFlow | undefined;
    if (timeFlow) {
      this.advance(timeFlow.gameDt);
    }
  }

  toJSON(): ClockData {
    return {
      tick: this.tick,
      day: this.day,
      dayStartTick: this.dayStartTick,
      fraction: this.fraction,
    };
  }
}

registerSerializable({
  type: "clock",
  singleton: true,
  schema,
  fromJSON: (data) => new Clock(data),
});
