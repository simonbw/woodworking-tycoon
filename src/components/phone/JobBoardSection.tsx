import React from "react";
import { AcceptedJob, JobOffer } from "../../game/GameState";
import {
  acceptJobAction,
  cancelJobAction,
  deliverJobAction,
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
import { TICKS_PER_DAY } from "../../game/time";
import { useApplyGameAction, useGameState } from "../useGameState";

/**
 * The Job Board pane of the phone: open offers to accept (limited by
 * reputation-gated slots) and accepted jobs with their decaying tips,
 * ready to deliver from the player's inventory. The phone's tab bar
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
  return (
    <ul className="space-y-0.5">
      {job.requiredMaterials.map((req, i) => {
        const have = Math.min(
          gameState.player.inventory.filter((m) => materialMeetsInput(m, req))
            .length,
          req.quantity,
        );
        return (
          <li key={i} className="flex items-center gap-2 text-xs">
            <span className="font-mono leading-none">
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
        <span className="font-mono text-sm tabular-nums">
          ${offer.basePay.toFixed(2)}
          <span className="text-gold-dark"> +tip</span>
        </span>
      </div>
      <p className="font-ink text-base leading-snug text-ink-blue">
        {offer.description}
      </p>
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
  const tipDaysLeft = (tipRemaining * JOB_TIP_DECAY_TICKS) / TICKS_PER_DAY;
  const canDeliver = job.requiredMaterials.every(
    (req) =>
      gameState.player.inventory.filter((m) => materialMeetsInput(m, req))
        .length >= req.quantity,
  );

  return (
    <li className="bg-white border border-ink-black/15 rounded-sm p-2 space-y-1.5 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-condensed font-semibold text-sm">{job.name}</span>
        <span className="font-mono text-sm tabular-nums">
          ${payout.money.toFixed(2)}
        </span>
      </div>
      <p className="font-ink text-base leading-snug text-ink-blue">
        {job.description}
      </p>
      <JobRequirements job={job} />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-ink-fade">
          {tipRemaining > 0
            ? `tip fades over ${tipDaysLeft.toFixed(1)} days`
            : "tip expired — base pay only"}
        </span>
        <span className="flex items-center gap-1">
          <button
            className="button-paper text-xs"
            onClick={() => applyAction(cancelJobAction(job.id))}
          >
            Cancel
          </button>
          <button
            className="button-paper text-xs"
            disabled={!canDeliver}
            onClick={() => applyAction(deliverJobAction(job.id))}
          >
            Deliver
          </button>
        </span>
      </div>
    </li>
  );
};
