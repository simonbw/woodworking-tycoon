import React, { useEffect } from "react";
import { clearPendingSoundsAction } from "../game/game-actions/sound-actions";
import { SoundEventKind } from "../game/SoundEvent";
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

/**
 * Clip + relative gain for each cue, or `null` when no asset is wired yet — the
 * bridge still runs end to end, it just plays nothing until the file lands.
 * The SFX-content work (#32) drops clips into `static/sounds/` and fills these
 * in (per-machine variants can key off `event.machineTypeId`).
 */
const SOUND_FOR: Record<SoundEventKind, { clip: string; gain: number } | null> =
  {
    "operation-complete": null, // TODO(#32): machine-operation clip(s)
  };

export const GameSoundLayer: React.FC = () => {
  const gameState = useGameState();
  const applyAction = useApplyGameAction();
  const pending = gameState.pendingSounds;

  useEffect(() => {
    if (!pending || pending.length === 0) return;
    for (const event of pending) {
      const sound = SOUND_FOR[event.kind];
      if (sound) playSound(sound.clip, sound.gain);
    }
    // Drain the queue now that its cues have been played.
    applyAction(clearPendingSoundsAction);
  }, [pending, applyAction]);

  return null;
};
