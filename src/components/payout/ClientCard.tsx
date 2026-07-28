import React from "react";
import { PayoutEvent } from "../../game/PayoutEvent";
import { formatCount, formatDecimal, formatMoney } from "../../utils/formatNumber";
import { Modal } from "../Modal";

/**
 * What the client said when they took delivery, dealt onto the screen as a
 * signed-off work order. Commissions only — they're the game's boss fights,
 * and a boss should say something before the money lands.
 *
 * Dismissing it is what releases the reward flight (see
 * `RewardFlightLayer`), so the payout reads as a consequence of the handoff
 * rather than a number that moved while the player was looking elsewhere.
 */
export const ClientCard: React.FC<{
  payout: PayoutEvent;
  onDismiss: () => void;
}> = ({ payout, onDismiss }) => (
  <Modal
    onClose={onDismiss}
    label={`${payout.title} — delivered`}
    panelClassName="payout-card-in relative w-[30rem] max-w-full bg-paper-legal text-ink-black p-6 rounded-sm shadow-2xl"
  >
    <div data-testid="client-card">
      <header className="border-b-2 border-ink-black/40 pb-2">
        <div className="font-condensed uppercase tracking-[0.25em] text-[0.65rem] text-ink-fade">
          Delivered
        </div>
        <h2 className="font-typewriter font-bold text-xl uppercase tracking-widest">
          {payout.title}
        </h2>
      </header>

      <blockquote className="font-ink text-lg leading-snug text-ink-blue py-4">
        “{payout.dialogue}”
      </blockquote>
      <div className="font-typewriter text-sm text-ink-fade -mt-2">
        — {payout.client}
      </div>

      <dl className="mt-5 flex items-baseline gap-6 border-t border-ink-black/20 pt-3">
        <div>
          <dt className="font-condensed uppercase tracking-[0.15em] text-[0.65rem] text-ink-fade">
            Paid
          </dt>
          <dd className="font-mono text-lg tabular-nums">
            {formatMoney(payout.money)}
          </dd>
        </div>
        <div>
          <dt className="font-condensed uppercase tracking-[0.15em] text-[0.65rem] text-ink-fade">
            Reputation
          </dt>
          <dd className="font-mono text-lg tabular-nums text-gold-dark">
            +{formatDecimal(payout.reputation)}
          </dd>
        </div>
        <div>
          <dt className="font-condensed uppercase tracking-[0.15em] text-[0.65rem] text-ink-fade">
            Craft XP
          </dt>
          <dd className="font-mono text-lg tabular-nums text-ink-blue">
            +{formatCount(payout.xp)}
          </dd>
        </div>
      </dl>

      <div className="mt-5 flex justify-end">
        <button
          className="button-paper"
          onClick={onDismiss}
          autoFocus
          data-sfx="ui-click"
        >
          Take the money
        </button>
      </div>
    </div>
  </Modal>
);
