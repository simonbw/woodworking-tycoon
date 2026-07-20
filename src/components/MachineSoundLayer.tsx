import React, { useEffect, useRef } from "react";
import { getMachines, MachineId, MachineState } from "../game/Machine";
import { deriveMachineSoundPhase } from "../game/machine-sound-helpers";
import { LoopingSoundPlayer, MachineSoundDef } from "../utils/loopingSound";
import { useGameState } from "./useGameState";

/**
 * The continuous-sound sibling of `GameSoundLayer`. One-shots are driven by
 * queued `SoundEvent`s; machine hum can't be, because operations pause,
 * resume, and survive save reloads — a missed "stop" event would leave a saw
 * screaming forever. Instead this headless component derives each machine's
 * desired sound phase from game state on every render and lets a
 * `LoopingSoundPlayer` per placed machine converge on it.
 *
 * Mounted once inside the GameStateProvider (see `Main.tsx`).
 */

/**
 * Machines with a continuous sound set. Machines not listed here (benches,
 * the miter saw — whose whole cycle is one short one-shot) keep the existing
 * one-shot path; both systems coexist.
 */
const MACHINE_SOUND_DEFS: Partial<Record<MachineId, MachineSoundDef>> = {
  lunchboxPlaner: {
    start: "planer-start",
    runLoop: "planer-run-loop",
    cutLoop: "planer-cut-loop",
    stop: "planer-stop",
    gain: 0.5,
  },
};

/**
 * Machines have no id; position is their identity (moving one in the layout
 * editor is a remove + re-add, which correctly retires the old player).
 */
function machineKey(state: MachineState): string {
  return `${state.machineTypeId}@${state.position[0]},${state.position[1]}`;
}

export const MachineSoundLayer: React.FC = () => {
  const gameState = useGameState();
  const playersRef = useRef(new Map<string, LoopingSoundPlayer>());

  useEffect(() => {
    const players = playersRef.current;
    const seen = new Set<string>();
    for (const machine of getMachines(gameState.machines)) {
      const def = MACHINE_SOUND_DEFS[machine.state.machineTypeId];
      if (!def) continue;
      const key = machineKey(machine.state);
      seen.add(key);
      let player = players.get(key);
      if (!player) {
        player = new LoopingSoundPlayer(def);
        players.set(key, player);
      }
      player.setPhase(
        deriveMachineSoundPhase(
          machine,
          gameState.player.position,
          gameState.player.away !== null,
          gameState.progression,
        ),
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
