import React from "react";
import { hasRequiredMaterials } from "../../game/delivery";
import { AcceptedJob, JobOffer } from "../../game/GameState";
import { formatMoney } from "../../utils/formatNumber";
import {
  acceptJobAction,
  cancelJobAction,
} from "../../game/game-actions/marketplace-actions";
import {
  JOB_TIP_DECAY_TICKS,
  jobPayout,
  jobTipRemaining,
  maxAcceptedJobs,
} from "../../game/marketplace";
import {
  describeMaterialRequirement,
  materialMeetsInput,
} from "../../game/material-helpers";
import { TICKS_PER_CALENDAR_DAY } from "../../game/time";
import { useApplyGameAction, useGameState } from "../useGameState";

/**
 * The Job Board pane of the phone: open offers to accept (limited by
 * reputation-gated slots) and accepted jobs with their decaying tips. The
 * phone takes the order and cancels it; handing the work over happens in
 * person at the garage door (see `TruckPrompt`). The phone's tab bar
 * provides the pane's title.
 */
export const JobBoardSection: React.FC = () => {
  const gameState = useGameState();
  const slots = maxAcceptedJobs(gameState.reputation);
  const slotsFree = slots - gameState.acceptedJobs.length;

  return (
    <section className="space-y-4">
      <h3 className="font-condensed font-semibold uppercase tracking-[0.15em] text-xs text-ink-fade">
        Your jobs ({gameState.acceptedJobs.length}/{slots})
      </h3>
      {gameState.acceptedJobs.length === 0 ? (
        <p className="text-sm italic text-ink-fade">
          No jobs accepted. Take one below for guaranteed pay.
        </p>
      ) : (
        <ul className="space-y-2">
          {gameState.acceptedJobs.map((job) => (
            <AcceptedJobRow key={job.id} job={job} />
          ))}
        </ul>
      )}

      <h3 className="font-condensed font-semibold uppercase tracking-[0.15em] text-xs text-ink-fade pt-2">
        Open offers
      </h3>
      {gameState.jobBoard.length === 0 ? (
        <p className="text-sm italic text-ink-fade">
          Nothing posted right now. Check back tomorrow.
        </p>
      ) : (
        <ul className="space-y-2">
          {gameState.jobBoard.map((offer) => (
            <JobOfferRow key={offer.id} offer={offer} slotsFree={slotsFree} />
          ))}
        </ul>
      )}
    </section>
  );
};

const JobRequirements: React.FC<{ job: JobOffer }> = ({ job }) => {
  const gameState = useGameState();
  // In hand or already loaded in the truck's bed — both count
  const pool = [...gameState.player.inventory, ...gameState.truck.bed];
  return (
    <ul className="space-y-0.5">
      {job.requiredMaterials.map((req, i) => {
        const have = Math.min(
          pool.filter((m) => materialMeetsInput(m, req)).length,
          req.quantity,
        );
        return (
          <li key={i} className="flex items-center gap-2 text-xs">
            <span className="leading-none">
              {have >= req.quantity ? "☑" : "☐"}
            </span>
            <span className="tabular-nums">
              {have}/{req.quantity}
            </span>
            <span>{describeMaterialRequirement(req)}</span>
          </li>
        );
      })}
    </ul>
  );
};

const JobOfferRow: React.FC<{ offer: JobOffer; slotsFree: number }> = ({
  offer,
  slotsFree,
}) => {
  const applyAction = useApplyGameAction();

  return (
    <li className="bg-paper-cream border border-ink-black/10 rounded-sm p-2 space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-condensed font-semibold text-sm">
          {offer.name}
        </span>
        <span className="text-sm tabular-nums">
          {formatMoney(offer.basePay)}
          <span className="text-gold-dark"> +tip</span>
        </span>
      </div>
      {/* The poster's own typing — screen text, not handwriting. */}
      <p className="text-sm leading-snug">{offer.description}</p>
      <div className="flex items-end justify-between gap-2">
        <JobRequirements job={offer} />
        <button
          className="button-paper text-xs"
          disabled={slotsFree <= 0}
          title={slotsFree <= 0 ? "No free job slots" : undefined}
          onClick={() => applyAction(acceptJobAction(offer.id))}
        >
          Accept
        </button>
      </div>
    </li>
  );
};

const AcceptedJobRow: React.FC<{ job: AcceptedJob }> = ({ job }) => {
  const gameState = useGameState();
  const applyAction = useApplyGameAction();

  const payout = jobPayout(job, gameState.tick);
  const tipRemaining = jobTipRemaining(job, gameState.tick);
  const tipDaysLeft =
    (tipRemaining * JOB_TIP_DECAY_TICKS) / TICKS_PER_CALENDAR_DAY;
  const pool = [...gameState.player.inventory, ...gameState.truck.bed];
  const canDeliver = job.requiredMaterials.every(
    (req) =>
      pool.filter((m) => materialMeetsInput(m, req)).length >= req.quantity,
  );
  const bedReady = hasRequiredMaterials(
    gameState.truck.bed,
    job.requiredMaterials,
  );

  return (
    <li className="bg-white border border-ink-black/15 rounded-sm p-2 space-y-1.5 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-condensed font-semibold text-sm">{job.name}</span>
        <span className="text-sm tabular-nums">
          {formatMoney(payout.money)}
        </span>
      </div>
      <p className="text-sm leading-snug">{job.description}</p>
      <JobRequirements job={job} />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-ink-fade">
          {tipRemaining > 0
            ? `tip fades over ${tipDaysLeft.toFixed(1)} days`
            : "tip expired — base pay only"}
        </span>
        <button
          className="button-paper text-xs"
          onClick={() => applyAction(cancelJobAction(job.id))}
        >
          Cancel
        </button>
      </div>
      {/* The customer collects; the phone only takes the order. */}
      <p className="text-xs text-ink-blue" data-testid="job-delivery-note">
        {bedReady
          ? "Ready — deliver it from the truck's cab."
          : canDeliver
            ? "Ready — load it into the truck's bed."
            : "Deliver it with the truck once it's built."}
      </p>
    </li>
  );
};
