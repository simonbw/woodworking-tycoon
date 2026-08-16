import React, { useEffect } from "react";
import { clearPendingSoundsAction } from "../game/game-actions/sound-actions";
import { clipBus, clipFor, clipGain, clipMinGapMs } from "../game/sound-clips";
import { playSound } from "../utils/sfx";
import { useApplyGameAction, useGameState } from "./useGameState";

/**
 * The game-event → sound bridge. Pure actions can't (and shouldn't) touch the
 * DOM or Web Audio, so instead they queue semantic cues onto
 * `gameState.pendingSounds`. This headless component drains that queue each
 * render: it plays the mapped clip for each cue, then clears the queue.
 *
 * Mounted once inside the GameStateProvider (see `Main.tsx`).
 */

const lastPlayedAt = new Map<string, number>();

function playThrottled(clip: string): void {
  const now = Date.now();
  const last = lastPlayedAt.get(clip);
  if (last !== undefined && now - last < clipMinGapMs(clip)) return;
  lastPlayedAt.set(clip, now);
  playSound(clip, clipGain(clip), clipBus(clip));
}

export const GameSoundLayer: React.FC = () => {
  const gameState = useGameState();
  const applyAction = useApplyGameAction();
  const pending = gameState.pendingSounds;

  useEffect(() => {
    if (!pending || pending.length === 0) return;
    // Collapse duplicates within a drain — three machines finishing on the same
    // tick should sound like one hit, not a flam.
    const clips = new Set<string>();
    for (const event of pending) {
      const clip = clipFor(event);
      if (clip) clips.add(clip);
    }
    clips.forEach(playThrottled);
    // Drain the queue now that its cues have been played.
    applyAction(clearPendingSoundsAction);
  }, [pending, applyAction]);

  return null;
};
