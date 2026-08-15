import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  REWARD_TARGET_ATTRIBUTE,
  RewardTarget,
} from "../../../components/payout/rewardTargets";
import { SparkIcon, StarIcon } from "../../../components/StarIcon";
import { PayoutEvent } from "../../../game/PayoutEvent";
import { playSound } from "../../../utils/sfx";
import { PayoutBuffer } from "../../PayoutBuffer";
import { useGame, useShellVersion, useShopState } from "../../useShell";

/**
 * The payoff moment, ported to the engine shell. A piece selling off the
 * stand is the beat the whole loop builds to, and until this layer
 * existed it was two numbers quietly changing in the top bar.
 *
 * The sim can't animate, so the StreetSystem announces each sale as a
 * "payout" event, the PayoutBuffer holds the announcements, and this
 * layer stages them: coins and a star fly from the middle of the screen
 * to the readouts that track them (balance, reputation), each landing
 * with a thump on its target and, for the money, the cha-ching.
 *
 * The underlying numbers changed the instant the sale settled — the
 * flight is decoration over an already-settled state, so nothing here
 * can desync it.
 *
 * The flight waits for the player to be home: a sale can land while
 * they're out on a trip, when the readouts the chips aim at aren't on
 * screen. Nothing is dropped by waiting — the buffer simply keeps until
 * the shop is there to celebrate in. (The old layer also waited for the
 * truck's arrival roll; the roll's stage store arrives with phase 6's
 * trip theater.)
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
  const game = useGame();
  useShellVersion();
  const gameState = useShopState();
  // Home and interactive: the readouts the chips aim at are on screen.
  const home = !gameState.player.away;

  const [flights, setFlights] = useState<ReadonlyArray<Flight>>([]);
  /**
   * Every payout this session has already been staged from. React is
   * free to re-invoke effects, and a drained announcement is the same
   * announcement, not a second payday — it must not fly twice (#159).
   */
  const staged = useRef(new Set<string>());

  const launch = useCallback((payout: PayoutEvent) => {
    const chips = chipsFor(payout);
    if (chips.length === 0) return;
    setFlights((current) => [
      ...current,
      {
        id: payout.id,
        chips,
        // Burst from the middle of the window: the one point guaranteed
        // to be on screen wherever the player is standing.
        originX: window.innerWidth / 2,
        originY: window.innerHeight / 2,
      },
    ]);
  }, []);

  // Drain the buffer once the player is home. Announcements already
  // staged are dropped rather than celebrated again.
  useEffect(() => {
    if (!home) return;
    const buffer = game.entities.tryGetSingleton(PayoutBuffer);
    if (!buffer || buffer.pending.length === 0) return;
    for (const payout of buffer.drain()) {
      if (staged.current.has(payout.id)) continue;
      staged.current.add(payout.id);
      launch(payout);
    }
  });

  const endFlight = useCallback((flightId: string) => {
    setFlights((current) => current.filter((flight) => flight.id !== flightId));
  }, []);

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[60] overflow-hidden"
      aria-hidden
      data-testid="reward-flights"
    >
      {flights.map((flight) => (
        <FlightChips key={flight.id} flight={flight} onDone={endFlight} />
      ))}
    </div>
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
