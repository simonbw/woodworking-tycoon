import React, { useEffect, useState } from "react";
import { getActiveCommission } from "../../game/commissionSequence";
import { markCommissionArrivalSeenAction } from "../../game/game-actions/progression-actions";
import { useClipboard } from "../clipboard/ClipboardProvider";
import { useModalScope } from "../shortcuts/ShortcutProvider";
import { useApplyGameAction, useGameState } from "../useGameState";

/**
 * The commission-arrival moment. When reputation crosses the next
 * commission's threshold the sim rings the phone (see
 * checkProgressionMilestonesAction); this layer waits for a quiet moment —
 * home from any trip, no payout celebration mid-flight — then holds the
 * phone up as a takeover: the client's messages arrive one by one, and the
 * only way out is to reply. Accepting marks the arrival seen and opens the
 * clipboard on the new work order.
 *
 * The sim keeps ticking behind it, like every overlay but the pause menu.
 */

/** Same fast-path flag the trip performance uses: E2E runs skip the wait. */
const TRANSITIONS_DISABLED = Number(process.env.E2E_RENDER_FPS) > 0;

/** The beat between the ring and the phone coming up. */
const ANSWER_DELAY_MS = TRANSITIONS_DISABLED ? 0 : 900;
/** The typing rhythm of the client's messages. */
const BUBBLE_INTERVAL_MS = TRANSITIONS_DISABLED ? 0 : 1100;

export const CommissionCallLayer: React.FC = () => {
  const gameState = useGameState();
  const [open, setOpen] = useState(false);

  const commission = getActiveCommission(gameState.progression);
  const callWaiting =
    commission !== null && !gameState.progression.commissionArrivalSeen;
  const quiet =
    !gameState.player.away && (gameState.pendingPayouts ?? []).length === 0;
  const shouldOpen = callWaiting && quiet;

  // Answer after a beat, and never over the payout card — the client card
  // lives in RewardFlightLayer's own state, so it's polled for, not read.
  useEffect(() => {
    if (!shouldOpen || open) {
      return;
    }
    const answer = () => {
      if (document.querySelector('[data-testid="client-card"]')) return;
      setOpen(true);
    };
    const first = window.setTimeout(answer, ANSWER_DELAY_MS);
    const retry = window.setInterval(answer, 500);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(retry);
    };
  }, [shouldOpen, open]);

  useEffect(() => {
    if (!callWaiting && open) {
      setOpen(false);
    }
  }, [callWaiting, open]);

  if (!open || !commission) {
    return null;
  }
  return (
    <CallModal
      key={commission.id}
      client={commission.client}
      messages={commission.call}
      onAccept={() => setOpen(false)}
    />
  );
};

/**
 * The phone held up mid-ring: the same handset chrome as PhoneModal, but
 * with no way out except through the conversation — no backdrop click, no
 * Escape, no close button. A cutscene you answer.
 */
const CallModal: React.FC<{
  client: string;
  messages: ReadonlyArray<string>;
  onAccept: () => void;
}> = ({ client, messages, onAccept }) => {
  const applyAction = useApplyGameAction();
  const clipboard = useClipboard();
  // Same keyboard scope as any modal, so the floor's keys go quiet — but
  // no close shortcut is registered: the reply button is the only exit.
  useModalScope();

  const [bubblesShown, setBubblesShown] = useState(
    TRANSITIONS_DISABLED ? messages.length : 1,
  );
  const conversationDone = bubblesShown >= messages.length;

  useEffect(() => {
    if (conversationDone) {
      return;
    }
    const timer = window.setInterval(
      () => setBubblesShown((count) => count + 1),
      Math.max(BUBBLE_INTERVAL_MS, 1),
    );
    return () => window.clearInterval(timer);
  }, [conversationDone]);

  const accept = () => {
    applyAction(markCommissionArrivalSeenAction());
    onAccept();
    // The new work order goes straight onto the clipboard, held up — the
    // continuity beat that used to follow the payout flight.
    clipboard.open();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-black/60 p-4"
      role="presentation"
      data-testid="commission-call"
    >
      {/* The handset (see PhoneModal) */}
      <div
        className="phone-ring-in relative flex max-h-[85vh] w-[24rem] max-w-full flex-col rounded-[2.25rem] border border-black bg-zinc-900 p-2.5 shadow-[0_20px_50px_rgba(0,0,0,0.6)]"
        role="dialog"
        aria-modal="true"
        aria-label={`Message from ${client}`}
      >
        {/* The screen */}
        <div className="flex min-h-0 grow flex-col overflow-hidden rounded-[1.75rem] bg-paper-ivory text-ink-black">
          <header className="border-b border-ink-black/15 bg-ink-blue px-5 py-3 text-white">
            <span className="block font-condensed text-[0.6rem] uppercase tracking-[0.25em] text-white/70">
              New message
            </span>
            <span className="block font-condensed text-lg font-bold leading-tight">
              {client}
            </span>
          </header>
          <div className="flex min-h-0 grow flex-col gap-2 overflow-y-auto px-4 py-4">
            {messages.slice(0, bubblesShown).map((message, i) => (
              <p
                key={i}
                className="bubble-in max-w-[85%] self-start rounded-2xl rounded-bl-sm bg-ink-black/10 px-3.5 py-2 text-sm leading-snug"
              >
                {message}
              </p>
            ))}
            {!conversationDone && (
              <span
                className="max-w-[85%] self-start rounded-2xl rounded-bl-sm bg-ink-black/5 px-3.5 py-2 text-sm tracking-[0.2em] text-ink-fade"
                aria-hidden
              >
                •••
              </span>
            )}
            {conversationDone && (
              <button
                className="bubble-in mt-2 self-end rounded-2xl rounded-br-sm bg-ink-blue px-4 py-2 font-condensed text-sm font-bold uppercase tracking-[0.15em] text-white shadow hover:brightness-110"
                onClick={accept}
                data-testid="commission-call-accept"
                data-sfx="ui-click"
              >
                I'll take it
              </button>
            )}
          </div>
        </div>
        {/* Home indicator */}
        <div className="mx-auto mt-2 h-1 w-24 shrink-0 rounded-full bg-zinc-600" />
      </div>
    </div>
  );
};
