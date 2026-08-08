import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { SCAVENGE_RETURN_TICKS } from "../../game/game-actions/scavenge-actions";
import { playSound, preloadSound } from "../../utils/sfx";
import { DeliveryTripOverlay } from "./DeliveryTripOverlay";
import { LumberyardTripOverlay } from "../lumberyard-page/LumberyardTripOverlay";
import { ScavengeTripOverlay } from "../scavenge-page/ScavengeTripOverlay";
import { StoreTripOverlay } from "../store-page/StoreTripOverlay";
import { SleepOverlay } from "./SleepOverlay";
import { setTruckStage, useTruckStage } from "../shop-view/truckStageStore";
import { useGameState } from "../useGameState";

/**
 * The theater around a trip. The simulation flips `player.away` in one
 * tick; this layer stretches that instant into a scene: the trip card
 * folds, the engine cranks, the truck rolls down the driveway and off
 * the lot, the screen dips to black, and the destination is there when
 * it comes back. Heading home fades to black *over the destination*
 * (`useHeadHome` delays the actual return action until the screen is
 * dark, and the scavenging timer pre-fades as its return tick closes
 * in), then reveals the shop with the truck backing up the driveway —
 * the player stays inside it, hidden, until it parks.
 *
 * GameState semantics are untouched — `away` still flips before any
 * frame of the arrival plays, saves and ticks behave identically — so a
 * save loaded mid-trip just opens on the overlay with no performance.
 * The stage machine lives in truckStageStore; TruckSprite reads it for
 * the motion, ShopView for hiding the player and holding input, and
 * TripOverlays below for when the destination takes the screen.
 *
 * The E2E build skips the whole show (the same flag that caps its
 * renderer): specs click "Go" and expect the store that frame.
 */
export const TRUCK_DEPART_MS = 2600;
/** When the wheels start moving within the departure — the first
 * stretch is the crank and the idle settling. */
export const TRUCK_ROLL_OUT_MS = 1400;
export const TRUCK_ARRIVE_MS = 2900;
/** How much of the arrival the truck spends rolling; the remainder is
 * the parking brake and the door. */
export const TRUCK_ROLL_IN_MS = 1700;
const FADE_MS = 400;

/** How close the scavenging return tick gets (at 5 ticks/s) before the
 * screen starts dipping — the swap home then happens under black. */
const SCAVENGE_PREFADE_TICKS = 3;

const TRANSITIONS_DISABLED = Number(process.env.E2E_RENDER_FPS) > 0;

/** Runs `apply` once the screen has faded to black (immediately in the
 * E2E build). Handed to the overlays' Head Home buttons. */
const HeadHomeContext = createContext<(apply: () => void) => void>((apply) =>
  apply(),
);

export function useHeadHome(): (apply: () => void) => void {
  return useContext(HeadHomeContext);
}

export const TripTransitionLayer: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const gameState = useGameState();
  const away = gameState.player.away != null;
  const [faded, setFaded] = useState(false);
  const mounted = useRef(false);
  const pendingReturn = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A quit-to-menu mid-fade must not fire the queued return into a
  // provider that no longer exists. Warm the trip clips on the way in —
  // the crank should land with the click, not a fetch later.
  useEffect(() => {
    preloadSound("truck-start");
    preloadSound("truck-arrive");
    return () => {
      if (pendingReturn.current) clearTimeout(pendingReturn.current);
    };
  }, []);

  // Head Home: dip to black first, then apply the return action — the
  // destination page is what fades out, not the shop.
  const headHome = (apply: () => void) => {
    if (TRANSITIONS_DISABLED) {
      apply();
      return;
    }
    if (pendingReturn.current) return; // already on the way out
    setFaded(true);
    pendingReturn.current = setTimeout(() => {
      pendingReturn.current = null;
      apply();
    }, FADE_MS);
  };

  // The scavenging trip's drive home ends on a timer, not a button —
  // start the dip as the return tick closes in so the swap happens under
  // black. (Head Home from the cab starts the drive; this ends it.)
  const scavengeAway = gameState.player.away;
  const scavengeReturnSoon =
    !TRANSITIONS_DISABLED &&
    scavengeAway?.kind === "scavenging" &&
    scavengeAway.phase.kind === "drivingHome" &&
    scavengeAway.phase.returnTick - gameState.tick <= SCAVENGE_PREFADE_TICKS &&
    // A drive just started is not a drive about to end (fixture edits can
    // put the tick anywhere).
    scavengeAway.phase.returnTick - gameState.tick > -SCAVENGE_RETURN_TICKS;
  useEffect(() => {
    if (scavengeReturnSoon) setFaded(true);
  }, [scavengeReturnSoon]);

  useEffect(() => {
    // First mount (a fresh boot, a save loaded mid-trip): take the state
    // as found, no performance.
    if (!mounted.current) {
      mounted.current = true;
      setTruckStage(away ? "away" : "parked");
      return;
    }

    if (away) {
      if (TRANSITIONS_DISABLED) {
        setTruckStage("away");
        return;
      }
      setTruckStage("departing");
      // Dry, not through the garage reverb — the driveway is outdoors.
      playSound("truck-start", 0.7, "sfx");
      const fadeTimer = setTimeout(
        () => setFaded(true),
        TRUCK_DEPART_MS - FADE_MS,
      );
      const doneTimer = setTimeout(() => {
        setTruckStage("away");
        setFaded(false);
      }, TRUCK_DEPART_MS);
      return () => {
        clearTimeout(fadeTimer);
        clearTimeout(doneTimer);
        setFaded(false);
      };
    }

    if (TRANSITIONS_DISABLED) {
      setTruckStage("parked");
      return;
    }
    // Home. The screen is already black (Head Home and the scavenge
    // timer both fade before `away` clears); the shop swaps in
    // underneath, then the reveal rides the truck rolling in.
    setFaded(true);
    playSound("truck-arrive", 0.7, "sfx");
    const revealTimer = setTimeout(() => {
      setTruckStage("arriving");
      setFaded(false);
    }, 120);
    const doneTimer = setTimeout(
      () => setTruckStage("parked"),
      120 + TRUCK_ARRIVE_MS,
    );
    return () => {
      clearTimeout(revealTimer);
      clearTimeout(doneTimer);
      setFaded(false);
    };
  }, [away]);

  return (
    <HeadHomeContext.Provider value={headHome}>
      {children}
      <div
        aria-hidden
        className="fixed inset-0 z-[70] bg-black pointer-events-none transition-opacity ease-in-out"
        style={{ opacity: faded ? 1 : 0, transitionDuration: `${FADE_MS}ms` }}
      />
    </HeadHomeContext.Provider>
  );
};

/**
 * The destination overlays, held back while the truck is still rolling
 * out — they self-guard on `away`, which flips a whole performance
 * before the destination should be on screen.
 */
export const TripOverlays: React.FC = () => {
  const stage = useTruckStage();
  return (
    <div className={stage === "departing" ? "hidden" : undefined}>
      <StoreTripOverlay />
      <LumberyardTripOverlay />
      <ScavengeTripOverlay />
      <DeliveryTripOverlay />
      <SleepOverlay />
    </div>
  );
};
