import React, { useEffect, useRef } from "react";
import { getMachines, machineKey } from "../game/Machine";
import { deriveMachineCutLoad } from "../game/cut-load";
import { deriveMachineSoundPhase } from "../game/machine-sound-helpers";
import { MACHINE_VOICES, machineHasVoice } from "../utils/machineVoices";
import { MachineVoice } from "../utils/machineVoice";
import { useGameState } from "./useGameState";

/**
 * The continuous-sound sibling of `GameSoundLayer`. One-shots are driven by
 * queued `SoundEvent`s; machine hum can't be, because operations pause,
 * resume, and survive save reloads — a missed "stop" event would leave a saw
 * screaming forever. Instead this headless component derives each machine's
 * desired sound phase from game state on every render and lets a
 * `MachineVoice` per placed machine converge on it.
 *
 * Mounted once inside the GameStateProvider (see `Main.tsx`).
 */

// Re-exported for the sprites that follow the audible phase; the table
// itself moved to utils/machineVoices.ts, shared with the engine shell.
export { machineHasVoice };

export const MachineSoundLayer: React.FC = () => {
  const gameState = useGameState();
  const playersRef = useRef(new Map<string, MachineVoice>());

  useEffect(() => {
    const players = playersRef.current;
    const seen = new Set<string>();
    for (const machine of getMachines(gameState.machines)) {
      const makeVoice = MACHINE_VOICES[machine.state.machineTypeId];
      if (!makeVoice) continue;
      const key = machineKey(machine.state);
      seen.add(key);
      let player = players.get(key);
      if (!player) {
        player = makeVoice(key);
        players.set(key, player);
      }
      player.setPhase(
        deriveMachineSoundPhase(
          machine,
          gameState.player.position,
          gameState.player.away !== null,
          gameState.player.operating === true,
          gameState.progression,
        ),
        deriveMachineCutLoad(machine),
      );
    }
    // Machines sold or picked up since last render: silence their players.
    for (const [key, player] of players) {
      if (!seen.has(key)) {
        player.dispose();
        players.delete(key);
      }
    }
  }, [gameState]);

  // Quit to menu unmounts the provider tree; take the shop quiet with it.
  useEffect(() => {
    const players = playersRef.current;
    return () => {
      players.forEach((player) => player.dispose());
      players.clear();
    };
  }, []);

  return null;
};
