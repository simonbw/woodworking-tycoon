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
 * are shared with the old world). TimeFlow carries fractional pace into
 * whole sim ticks (`timeFlow.wholeTicks`); the clock counts them. Saves
 * land on whole minutes — the sub-minute carry is TimeFlow's and is
 * deliberately transient, like the old world's between-tick remainder.
 *
 * The day advances only by sleeping — the drive home sets a new
 * `dayStartTick` and bumps `day` — never by the tick counter rolling
 * over (the same rule as the old world's time-flow.ts).
 */

const schema = z.object({
  tick: z.number().int(),
  day: z.number().int(),
  dayStartTick: z.number().int(),
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

  constructor(data: Partial<ClockData> = {}) {
    super();
    this.tick = data.tick ?? 0;
    this.day = data.day ?? 1;
    this.dayStartTick = data.dayStartTick ?? 0;
  }

  /** How many of today's working minutes have been spent. */
  dayTicksSpent(): number {
    return this.tick - this.dayStartTick;
  }

  /**
   * The same question asked of a particular minute. A sim layer that
   * runs many minutes in one engine tick has already watched the counter
   * jump to the end of the batch, so it asks about the minute it is
   * simulating rather than the one the clock now reads.
   */
  isNightAt(tick: number): boolean {
    return tick - this.dayStartTick >= TICKS_PER_DAY;
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
    return this.isNightAt(this.tick);
  }

  @on("afterAdded")
  onAfterAdded() {
    // The clock is what knows night; TimeFlow asks it when resolving pace.
    const timeFlow = this.game.entities.tryGetSingleton(TimeFlow);
    timeFlow?.setNightProvider(() => this.isNight());
  }

  @on("tick")
  onTick() {
    // The minute carry lives in TimeFlow (transient, like the old
    // world's between-tick remainder — saves land on whole minutes);
    // the clock just counts the whole sim ticks it hands out.
    const timeFlow = this.game.entities.tryGetSingleton(TimeFlow);
    if (timeFlow) {
      this.tick += timeFlow.wholeTicks;
    }
  }

  toJSON(): ClockData {
    return {
      tick: this.tick,
      day: this.day,
      dayStartTick: this.dayStartTick,
    };
  }
}

registerSerializable({
  type: "clock",
  singleton: true,
  schema,
  fromJSON: (data) => new Clock(data),
});
