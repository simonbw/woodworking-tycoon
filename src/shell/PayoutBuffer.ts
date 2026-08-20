import { Persistence } from "../config/constants";
import { BaseEntity } from "../core/entity/BaseEntity";
import { Entity } from "../core/entity/Entity";
import { on } from "../core/entity/handler";
import { PayoutEvent } from "../game/PayoutEvent";
import { ShellStore } from "./ShellStore";

/**
 * The engine-side stand-in for the old `GameState.pendingPayouts` queue.
 * The StreetSystem announces each sale as a "payout" event; this entity
 * holds the announcements until the DOM's RewardFlightLayer is home to
 * celebrate them — a sale can land mid-trip, when the readouts the chips
 * aim at aren't on screen. Shell-side state, never serialized: the
 * numbers a payout announces settled in the sim the instant it fired,
 * and the flight is decoration over them.
 */
export class PayoutBuffer extends BaseEntity implements Entity {
  id = "payoutBuffer";
  persistenceLevel: number = Persistence.Permanent;
  pausable = false;

  pending: PayoutEvent[] = [];

  @on("payout")
  onPayout({ payout }: { payout: PayoutEvent }) {
    this.pending.push(payout);
    // The queue isn't in the ShellStore's signature (it's shell-side
    // state); announce the arrival ourselves.
    this.game.entities.tryGetSingleton(ShellStore)?.bump();
  }

  /** Hand over everything held, emptying the queue. */
  drain(): PayoutEvent[] {
    const drained = this.pending;
    this.pending = [];
    return drained;
  }
}
