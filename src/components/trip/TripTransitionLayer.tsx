import React, { useEffect, useRef, useState } from "react";
import { playTruckArrival, playTruckDeparture } from "../../utils/truckEngine";
import { LumberyardTripOverlay } from "../lumberyard-page/LumberyardTripOverlay";
import { ScavengeTripOverlay } from "../scavenge-page/ScavengeTripOverlay";
import { StoreTripOverlay } from "../store-page/StoreTripOverlay";
import { setTruckStage, useTruckStage } from "../shop-view/truckStageStore";
import { useGameState } from "../useGameState";

/**
 * The theater around a trip. The simulation flips `player.away` in one
 * tick; this layer stretches that instant into a scene: the trip card
 * folds, the engine cranks, the truck rolls down the driveway and off
 * the lot, the screen dips to black, and the destination is there when
 * it comes back. Heading home runs the reverse — a cut to black off the
 * overlay, then the truck backing up the driveway into its spot, the
 * parking brake, the door, and the player stepping out.
 *
 * GameState semantics are untouched — `away` still flips at click time,
 * saves and ticks behave identically — so a save loaded mid-trip just
 * opens on the overlay with no performance. The stage machine lives in
 * truckStageStore; TruckSprite reads it for the motion, ShopView for
 * hiding the player and holding input, and TripOverlays below for when
 * the destination takes the screen.
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

const TRANSITIONS_DISABLED = Number(process.env.E2E_RENDER_FPS) > 0;

export const TripTransitionLayer: React.FC = () => {
  const gameState = useGameState();
  const away = gameState.player.away != null;
  const [faded, setFaded] = useState(false);
  const mounted = useRef(false);

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
      playTruckDeparture();
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
    // Home: a cut to black carries the overlay-to-shop swap, then the
    // truck rolls in.
    setFaded(true);
    playTruckArrival();
    const revealTimer = setTimeout(() => {
      setTruckStage("arriving");
      setFaded(false);
    }, FADE_MS);
    const doneTimer = setTimeout(
      () => setTruckStage("parked"),
      FADE_MS + TRUCK_ARRIVE_MS,
    );
    return () => {
      clearTimeout(revealTimer);
      clearTimeout(doneTimer);
      setFaded(false);
    };
  }, [away]);

  return (
    <div
      aria-hidden
      className="fixed inset-0 z-[70] bg-black pointer-events-none transition-opacity ease-in-out"
      style={{ opacity: faded ? 1 : 0, transitionDuration: `${FADE_MS}ms` }}
    />
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
    </div>
  );
};
