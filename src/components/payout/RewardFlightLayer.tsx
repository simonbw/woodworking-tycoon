import React, { useCallback, useEffect, useRef, useState } from "react";
import { clearPendingPayoutsAction } from "../../game/game-actions/payout-actions";
import { PayoutEvent } from "../../game/PayoutEvent";
import { playSound } from "../../utils/sfx";
import { SparkIcon, StarIcon } from "../StarIcon";
import { useApplyGameAction, useGameState } from "../useGameState";
import { ClientCard } from "./ClientCard";
import { REWARD_TARGET_ATTRIBUTE, RewardTarget } from "./rewardTargets";

/**
 * The payoff moment. Handing work over at the garage door is the biggest
 * beat in the loop, and until this layer existed it was two numbers quietly
 * changing in the top bar.
 *
 * Pure reducers can't animate, so they queue a `PayoutEvent`
 * (`gameState.pendingPayouts`) and this headless-ish layer stages it:
 *
 * 1. A commission first deals the client's card onto the screen — what they
 *    said when they took delivery — and waits for the player to dismiss it.
 *    Jobs skip straight to step 2; they're routine work, not a boss.
 * 2. Coins, a star, and a spark fly from the middle of the screen to the
 *    readouts that track them (balance, reputation, journal), each landing
 *    with a thump on its target and, for the money, the cha-ching.
 *
 * The underlying numbers changed the instant the action ran — the flight is
 * decoration over an already-settled state, so nothing here can desync it.
 */

/** How many coins one payout throws. Bigger paydays throw more. */
function coinCount(money: number): number {
  if (money <= 0) return 0;
  return Math.min(12, 3 + Math.floor(Math.log10(Math.max(money, 1)) * 3));
}

interface Chip {
  readonly id: string;
  readonly target: RewardTarget;
  /**
   * What the chip carries. The star and spark are drawn (see StarIcon) —
   * as literal glyphs they came from whatever system font the browser fell
   * back to, which put a differently-shaped mark in flight than the one
   * waiting on the readout it lands on.
   */
  readonly glyph: React.ReactNode;
  readonly className: string;
  readonly delayMs: number;
  /** Spread around the burst origin so the chips don't fly as one blob. */
  readonly offsetX: number;
  readonly offsetY: number;
}

const FLIGHT_MS = 900;
const COIN_STAGGER_MS = 55;

function chipsFor(payout: PayoutEvent): Chip[] {
  const chips: Chip[] = [];
  const coins = coinCount(payout.money);
  for (let i = 0; i < coins; i++) {
    // Fan the coins around a circle so they leave the origin as a burst.
    const angle = (i / Math.max(coins, 1)) * Math.PI * 2;
    chips.push({
      id: `${payout.id}-coin-${i}`,
      target: "money",
      glyph: "$",
      className:
        "bg-gold text-ink-black border-gold-dark shadow-[0_0_12px_rgba(201,165,92,0.7)]",
      delayMs: i * COIN_STAGGER_MS,
      offsetX: Math.cos(angle) * 26,
      offsetY: Math.sin(angle) * 26,
    });
  }
  if (payout.reputation > 0) {
    chips.push({
      id: `${payout.id}-rep`,
      target: "reputation",
      glyph: <StarIcon />,
      className:
        "bg-paper-ivory text-gold-dark border-gold-dark shadow-[0_0_12px_rgba(156,126,63,0.6)]",
      delayMs: coins * COIN_STAGGER_MS + 90,
      offsetX: -30,
      offsetY: 8,
    });
  }
  if (payout.xp > 0) {
    chips.push({
      id: `${payout.id}-xp`,
      target: "xp",
      glyph: <SparkIcon />,
      className:
        "bg-ink-blue text-paper-ivory border-ink-blue shadow-[0_0_12px_rgba(31,58,110,0.7)]",
      delayMs: coins * COIN_STAGGER_MS + 200,
      offsetX: 30,
      offsetY: 8,
    });
  }
  return chips;
}

/** A flight in progress: the chips plus where they were launched from. */
interface Flight {
  readonly id: string;
  readonly chips: ReadonlyArray<Chip>;
  readonly originX: number;
  readonly originY: number;
}

export const RewardFlightLayer: React.FC = () => {
  const gameState = useGameState();
  const applyAction = useApplyGameAction();
  const pending = gameState.pendingPayouts;

  /** Commission cards waiting to be dismissed, oldest first. */
  const [cards, setCards] = useState<ReadonlyArray<PayoutEvent>>([]);
  const [flights, setFlights] = useState<ReadonlyArray<Flight>>([]);

  const launch = useCallback((payout: PayoutEvent) => {
    const chips = chipsFor(payout);
    if (chips.length === 0) return;
    setFlights((current) => [
      ...current,
      {
        id: payout.id,
        chips,
        // Burst from the middle of the window: it's where the client card
        // just was, and it's the one point guaranteed to be on screen.
        originX: window.innerWidth / 2,
        originY: window.innerHeight / 2,
      },
    ]);
  }, []);

  // Drain the queue: commissions become a card to dismiss, jobs fly at once.
  useEffect(() => {
    if (!pending || pending.length === 0) return;
    const commissions = pending.filter((payout) => payout.kind === "commission");
    if (commissions.length > 0) {
      setCards((current) => [...current, ...commissions]);
    }
    for (const payout of pending) {
      if (payout.kind !== "commission") launch(payout);
    }
    applyAction(clearPendingPayoutsAction);
  }, [pending, applyAction, launch]);

  // No next-order reveal here: the next commission arrives later, by
  // phone, once reputation reaches its threshold (see CommissionCallLayer)
  const dismissCard = useCallback(
    (payout: PayoutEvent) => {
      setCards((current) => current.filter((card) => card.id !== payout.id));
      launch(payout);
    },
    [launch],
  );

  const endFlight = useCallback((flightId: string) => {
    setFlights((current) => current.filter((flight) => flight.id !== flightId));
  }, []);

  return (
    <>
      {cards.length > 0 && (
        <ClientCard
          payout={cards[0]}
          onDismiss={() => dismissCard(cards[0])}
          key={cards[0].id}
        />
      )}
      <div
        className="pointer-events-none fixed inset-0 z-[60] overflow-hidden"
        aria-hidden
        data-testid="reward-flights"
      >
        {flights.map((flight) => (
          <FlightChips key={flight.id} flight={flight} onDone={endFlight} />
        ))}
      </div>
    </>
  );
};

/**
 * One payout's chips. Each measures its target on mount — the readouts move
 * with the layout, so the vector can't be precomputed — and reports back so
 * the flight can be dropped once the last chip lands.
 */
const FlightChips: React.FC<{
  flight: Flight;
  onDone: (flightId: string) => void;
}> = ({ flight, onDone }) => {
  const [vectors] = useState(() =>
    flight.chips.map((chip) => {
      const target = document.querySelector<HTMLElement>(
        `[${REWARD_TARGET_ATTRIBUTE}="${chip.target}"]`,
      );
      if (!target) return null;
      const rect = target.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2 - (flight.originX + chip.offsetX),
        y: rect.top + rect.height / 2 - (flight.originY + chip.offsetY),
      };
    }),
  );

  const landed = useRef(new Set<string>());

  // Drop the whole flight once the last chip has finished its arc.
  useEffect(() => {
    const last = flight.chips.reduce(
      (latest, chip) => Math.max(latest, chip.delayMs),
      0,
    );
    const timer = window.setTimeout(
      () => onDone(flight.id),
      last + FLIGHT_MS + 120,
    );
    return () => window.clearTimeout(timer);
  }, [flight, onDone]);

  const handleLanding = (chip: Chip) => {
    // Chips of a kind land in a stream; only the first one of each pays for
    // a sound and a thump, or a twelve-coin payout would machine-gun.
    if (landed.current.has(chip.target)) return;
    landed.current.add(chip.target);
    if (chip.target === "money") {
      playSound("cash-register", 0.75, "sfx");
    }
    pulseTarget(chip.target);
  };

  return (
    <>
      {flight.chips.map((chip, index) => {
        const vector = vectors[index];
        if (!vector) return null;
        return (
          <span
            key={chip.id}
            className={`reward-chip absolute flex h-7 w-7 items-center justify-center rounded-full border text-sm font-bold leading-none ${chip.className}`}
            style={
              {
                left: flight.originX + chip.offsetX,
                top: flight.originY + chip.offsetY,
                "--fly-x": `${vector.x}px`,
                "--fly-y": `${vector.y}px`,
                "--fly-delay": `${chip.delayMs}ms`,
                "--fly-duration": `${FLIGHT_MS}ms`,
              } as React.CSSProperties
            }
            onAnimationEnd={() => handleLanding(chip)}
          >
            {chip.glyph}
          </span>
        );
      })}
    </>
  );
};

/** Thump the readout a chip just landed on. */
function pulseTarget(target: RewardTarget): void {
  const element = document.querySelector<HTMLElement>(
    `[${REWARD_TARGET_ATTRIBUTE}="${target}"]`,
  );
  if (!element) return;
  element.classList.remove("reward-pulse");
  // Reading offsetWidth restarts the animation when two payouts land close
  // together; without it the class re-add is coalesced into no change.
  void element.offsetWidth;
  element.classList.add("reward-pulse");
  window.setTimeout(() => element.classList.remove("reward-pulse"), 500);
}
