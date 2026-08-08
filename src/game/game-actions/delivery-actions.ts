import { getActiveCommission } from "../commissionSequence";
import {
  canHandOff,
  consumeRequiredMaterials,
  ReadyHandoff,
} from "../delivery";
import { GameAction, GameState } from "../GameState";
import { truckCabSideCell } from "../lot";
import { jobPayout, roundToCents, roundToHundredth } from "../marketplace";
import { MaterialInstance } from "../Materials";
import { DeliveryOrder } from "../Person";
import { isNight } from "../time-flow";
import { driveTicks, DRIVE_TICKS_ONE_WAY } from "./door-actions";
import { combineActions } from "./misc-actions";
import { emitPayout } from "./payout-actions";
import {
  checkProgressionMilestonesAction,
  incrementCommissionsCompletedAction,
} from "./progression-actions";
import { withXp } from "./skill-actions";
import { emitSound } from "./sound-actions";

/**
 * The delivery run: the last mile of every piece of work the shop
 * finishes. Loading the bed and standing at the cab is only half of it —
 * somebody has to drive the thing over, and that costs the same minutes
 * a run to the store costs (`DRIVE_TICKS_ONE_WAY` each way, charged
 * through the ordinary tick pipeline). Delivering used to be the one
 * truck interaction that was free.
 *
 * Two actions, one round trip:
 *
 *  - `startDeliveryAction` takes the goods out of the bed, strikes the
 *    payout at the price the cab's card quoted, and drives out.
 *  - `returnFromDeliveryAction` drives back and settles it — money,
 *    reputation, XP, the job struck off or the commission counted, and
 *    the payout announcement the celebration is built on.
 *
 * The paperwork settling on the way in rather than at the door is
 * deliberate: the client card and the reward flight are the payoff beat
 * (see components/payout/), and they want the shop's own readouts on
 * screen to fly to. What happens at the door is the drop-off, which is
 * what DeliveryTripOverlay shows.
 *
 * Commissions and jobs come through here alike — `delivery.ts` already
 * owns the one matcher both tracks are paid by, and this owns the one
 * drive both tracks take.
 */

/** What the whole round trip costs, for the cab card's quote. */
export const DELIVERY_ROUND_TRIP_TICKS = DRIVE_TICKS_ONE_WAY * 2;

/**
 * What a handoff is worth and what it takes out of the bed, or null when
 * the bed can't cover it. The price is read here, at the moment the truck
 * pulls out, so a job's decaying tip is fixed by the drive rather than
 * shaved by it.
 */
function orderFor(
  gameState: GameState,
  handoff: ReadyHandoff,
): { order: DeliveryOrder; bed: ReadonlyArray<MaterialInstance> } | null {
  const requirements =
    handoff.kind === "commission"
      ? handoff.commission.requiredMaterials
      : handoff.job.requiredMaterials;
  const remaining = consumeRequiredMaterials(gameState.truck.bed, requirements);
  if (remaining === null) {
    return null;
  }
  const kept = new Set(remaining);
  const cargo = gameState.truck.bed.filter((material) => !kept.has(material));

  if (handoff.kind === "commission") {
    const { commission } = handoff;
    return {
      bed: remaining,
      order: {
        cargo,
        payout: {
          kind: "commission",
          title: commission.name,
          money: commission.rewardMoney,
          reputation: commission.rewardReputation,
          // Commissions teach: chunky XP alongside the payout
          xp: Math.round(commission.rewardMoney / 5),
          client: commission.client,
          dialogue: commission.thanks,
        },
      },
    };
  }

  const { job } = handoff;
  const payout = jobPayout(job, gameState.tick);
  return {
    bed: remaining,
    order: {
      jobId: job.id,
      cargo,
      payout: {
        kind: "job",
        title: job.name,
        money: payout.money,
        reputation: payout.reputation,
        xp: Math.round(payout.money / 5),
      },
    },
  };
}

/**
 * Drive finished work out to whoever ordered it. Called from the truck's
 * cab (see `TruckPrompt`) — the goods have to be loaded in the bed and
 * the player standing at the cab, because work leaving the shop is a
 * thing that happens somewhere. Nothing goes out after close: a delivery
 * is a trip, and the only place left to drive at night is home.
 */
export function startDeliveryAction(handoff: ReadyHandoff): GameAction {
  return (gameState) => {
    if (!canHandOff(gameState)) {
      console.warn("Can't deliver work right now");
      return gameState;
    }
    if (isNight(gameState)) {
      console.warn("Shop's closed for the night — nobody's taking delivery");
      return gameState;
    }
    if (
      handoff.kind === "commission" &&
      !getActiveCommission(gameState.progression)
    ) {
      console.warn("No active commission to deliver");
      return gameState;
    }
    if (
      handoff.kind === "job" &&
      !gameState.acceptedJobs.some((job) => job.id === handoff.job.id)
    ) {
      console.warn("Tried to deliver an unknown job");
      return gameState;
    }

    const loaded = orderFor(gameState, handoff);
    if (loaded === null) {
      console.warn("The bed doesn't hold what the order requires");
      return gameState;
    }

    return driveTicks({
      ...gameState,
      truck: { ...gameState.truck, bed: loaded.bed },
      player: {
        ...gameState.player,
        away: { kind: "delivering", order: loaded.order },
      },
    });
  };
}

/**
 * Pull back into the driveway with the run settled: the drive home
 * charges its minutes, the payout lands, and the player steps out beside
 * the cab.
 */
export function returnFromDeliveryAction(): GameAction {
  return (gameState) => {
    const away = gameState.player.away;
    if (away?.kind !== "delivering") {
      console.warn("Player is not out on a delivery");
      return gameState;
    }
    const { payout, jobId } = away.order;

    gameState = driveTicks(gameState);
    gameState = {
      ...gameState,
      money: roundToCents(gameState.money + payout.money),
      reputation: roundToHundredth(gameState.reputation + payout.reputation),
      acceptedJobs: jobId
        ? gameState.acceptedJobs.filter((job) => job.id !== jobId)
        : gameState.acceptedJobs,
      player: {
        ...gameState.player,
        away: null,
        position: truckCabSideCell(gameState.shopInfo),
      },
    };

    // The stinger is a commission's alone: a job is routine work, not a
    // boss, and its whole audio is the cha-ching the reward flight plays.
    if (payout.kind === "commission") {
      gameState = emitSound(gameState, { kind: "commission-complete" });
    }
    gameState = withXp(emitPayout(gameState, payout), payout.xp);

    // Progression only advances once the work has actually changed hands.
    return payout.kind === "commission"
      ? combineActions(
          incrementCommissionsCompletedAction(),
          checkProgressionMilestonesAction(),
        )(gameState)
      : gameState;
  };
}
