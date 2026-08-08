import React, { useEffect, useRef } from "react";
import { returnFromDeliveryAction } from "../../game/game-actions/delivery-actions";
import { getMaterialName } from "../../game/material-helpers";
import { DeliveryTrip } from "../../game/Person";
import { formatMoney } from "../../utils/formatNumber";
import { useTruckStage } from "../shop-view/truckStageStore";
import { useApplyGameAction, useGameState } from "../useGameState";
import { TripOverlay } from "./TripOverlay";
import { useHeadHome } from "./TripTransitionLayer";

/** How long the doorstep holds before the truck turns around. */
const DOORSTEP_BEAT_MS = 2200;

/** The E2E build skips the beat the same way it skips the truck rolls. */
const TRANSITIONS_DISABLED = Number(process.env.E2E_RENDER_FPS) > 0;

/**
 * The far end of a delivery run (see game-actions/delivery-actions.ts):
 * the truck at somebody's curb with the work coming out of the bed. Both
 * legs of the drive were charged when the trip started, so there is
 * nothing to wait out and nothing to decide here — the same shape as the
 * night card, a beat and then home. The payout lands on the way in,
 * where the readouts the reward flight aims at are on screen.
 */
export const DeliveryTripOverlay: React.FC = () => {
  const gameState = useGameState();
  const applyAction = useApplyGameAction();
  const beginReturn = useHeadHome();
  const away = gameState.player.away;
  const delivering = away?.kind === "delivering";
  // The beat starts when the slip actually owns the screen — the
  // departure roll comes first, and turning around under it would skip
  // the delivery entirely.
  const settled = useTruckStage() === "away";
  const heading = useRef(false);

  useEffect(() => {
    if (!delivering || !settled) {
      if (!delivering) heading.current = false;
      return;
    }
    const timer = setTimeout(
      () => {
        if (heading.current) return;
        heading.current = true;
        beginReturn(() => applyAction(returnFromDeliveryAction()));
      },
      TRANSITIONS_DISABLED ? 0 : DOORSTEP_BEAT_MS,
    );
    return () => clearTimeout(timer);
  }, [delivering, settled]);

  if (!delivering) {
    return null;
  }
  return <DeliverySlip trip={away} />;
};

/**
 * The slip that rides along with the work: who it's for, what came out
 * of the bed, and what was agreed. No buttons — the drive home is
 * already underway by the time anyone reads it.
 */
const DeliverySlip: React.FC<{ trip: DeliveryTrip }> = ({ trip }) => {
  const { payout, cargo } = trip.order;
  return (
    <TripOverlay label="Out on a delivery" testId="delivery-trip">
      <section className="paper-card m-auto w-[26rem] max-w-full -rotate-[0.4deg] space-y-3">
        <header className="border-b-2 border-ink-black/40 pb-1">
          <div className="font-condensed uppercase tracking-[0.25em] text-[0.65rem] text-ink-fade">
            Delivery slip
          </div>
          <h2 className="font-condensed font-bold text-xl uppercase tracking-wide">
            {payout.title}
          </h2>
        </header>

        <dl className="space-y-2 font-typewriter text-sm">
          {payout.client && (
            <div className="flex gap-3">
              <dt className="w-20 shrink-0 font-condensed uppercase tracking-[0.15em] text-[0.65rem] text-ink-fade">
                For
              </dt>
              <dd className="grow">{payout.client}</dd>
            </div>
          )}
          <div className="flex gap-3">
            <dt className="w-20 shrink-0 font-condensed uppercase tracking-[0.15em] text-[0.65rem] text-ink-fade">
              Out of the bed
            </dt>
            <dd className="grow" data-testid="delivery-cargo">
              <ul>
                {cargo.map((material, index) => (
                  <li key={index}>{getMaterialName(material)}</li>
                ))}
              </ul>
            </dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-20 shrink-0 font-condensed uppercase tracking-[0.15em] text-[0.65rem] text-ink-fade">
              Agreed
            </dt>
            <dd className="grow tabular-nums">{formatMoney(payout.money)}</dd>
          </div>
        </dl>

        <p className="border-t border-ink-black/15 pt-2 font-ink text-lg leading-none text-ink-blue">
          Signed for. Heading back to the shop.
        </p>
      </section>
    </TripOverlay>
  );
};
