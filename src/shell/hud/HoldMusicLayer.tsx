import React, { useEffect, useRef, useState } from "react";
import { timeSpeed } from "../../game/time-flow";
import { HOLD_MUSIC, MusicTrack } from "../../utils/musicTrack";
import { useGame, useShopState } from "../useShell";

/**
 * Hold music for the wait verb.
 *
 * Holding the wait key is the one thing the player does that is explicitly
 * *not* work — the shop runs itself while they stand there — so it gets the
 * sound of being put on hold. The track fades in once the key has been held
 * a beat and fades out the moment time starts being spent on something
 * else, which makes it a second reading of the clock: music playing means
 * the day is burning for nothing.
 *
 * Headless; mounted once in the HUD tree (see `EngineHud`).
 */

/**
 * How long the wait must be held before the music starts arriving. A tap of
 * the wait key costs only a few minutes and shouldn't be scored; this is
 * comfortably longer than a tap and comfortably shorter than the Ticker's
 * five-second rate ramp, so the music comes in while the clock is still
 * winding up rather than after it has settled.
 */
const HOLD_BEFORE_MUSIC_MS = 900;

export const HoldMusicLayer: React.FC = () => {
  const gameState = useShopState();
  const paused = useGame().paused;
  const trackRef = useRef<MusicTrack | null>(null);

  // The pause menu stops the world, so it stops the music too — otherwise
  // opening it mid-wait leaves elevator music playing over a frozen shop.
  const waiting = !paused && timeSpeed(gameState) === "waiting";

  // Held long enough to earn the music. Kept in state rather than a ref so
  // the effect below re-runs when the timer matures.
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!waiting) {
      setHeld(false);
      return;
    }
    const timer = setTimeout(() => setHeld(true), HOLD_BEFORE_MUSIC_MS);
    return () => clearTimeout(timer);
  }, [waiting]);

  useEffect(() => {
    if (!held) {
      trackRef.current?.setPlaying(false);
      return;
    }
    // Built on first use, so a session that never waits never streams it.
    trackRef.current ??= new MusicTrack(HOLD_MUSIC);
    trackRef.current.setPlaying(true);
  }, [held]);

  // Quit to menu unmounts the provider tree; take the music with it.
  useEffect(() => {
    return () => {
      trackRef.current?.dispose();
      trackRef.current = null;
    };
  }, []);

  return null;
};
