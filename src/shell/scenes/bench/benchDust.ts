import { BENCH_DUST_EMISSIONS_PER_SECOND } from "../../../game/game-actions/operation-actions";

/**
 * The pace hand work sheds dust at. Dust doesn't wait for the commit
 * (docs/bench-work.md): while the tool is moving, the view hands the sim
 * a throttled emission — `emitBenchDust` in `sim/commands/bench-commands.ts`
 * decides how much, sized so a board sanded by hand leaves about the mess
 * the same job leaves running hands-free.
 *
 * The clock runs whether or not the tool is cutting, so a tool picked up
 * after a pause sheds on its first stroke rather than half a second in.
 */
export const BENCH_DUST_INTERVAL_SECONDS = 1 / BENCH_DUST_EMISSIONS_PER_SECOND;

export class BenchDustThrottle {
  private since = BENCH_DUST_INTERVAL_SECONDS;

  /** Time passing, cutting or not. */
  step(dt: number): void {
    this.since += dt;
  }

  /** Work landed this frame: whether it's time to shed again. */
  due(): boolean {
    if (this.since < BENCH_DUST_INTERVAL_SECONDS) {
      return false;
    }
    this.since = 0;
    return true;
  }
}
