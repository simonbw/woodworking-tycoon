import React, { useEffect, useRef } from "react";
import { MusicTrack, TRUCK_DRIVING_LOOP } from "../../utils/musicTrack";
import { usePaused } from "../PauseContext";

/**
 * The engine under a scavenging search. The half-hour between stops is
 * spent driving, so it sounds like driving: the loop fades up as the
 * search starts and back down when the truck parks at the decision —
 * the same reading as the road and wheels going still (see
 * `ScavengeTripOverlay`).
 *
 * Streamed rather than decoded, like the hold music, on the sfx bus
 * (`musicTrack.ts`). Headless; mounted by the trip overlay, so the track
 * is built the first time anyone actually goes scavenging and released
 * when the trip ends.
 */
export const ScavengeDrivingSound: React.FC<{ driving: boolean }> = ({
  driving,
}) => {
  const { paused } = usePaused();
  const trackRef = useRef<MusicTrack | null>(null);
  // The pause menu stops the world, so it stops the truck too.
  const playing = driving && !paused;

  useEffect(() => {
    if (!playing) {
      trackRef.current?.setPlaying(false);
      return;
    }
    trackRef.current ??= new MusicTrack(TRUCK_DRIVING_LOOP);
    trackRef.current.setPlaying(true);
  }, [playing]);

  useEffect(() => {
    return () => {
      trackRef.current?.dispose();
      trackRef.current = null;
    };
  }, []);

  return null;
};
