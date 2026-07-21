import React, { useEffect, useRef } from "react";
import { getMachines, MachineId, MachineState } from "../game/Machine";
import { deriveMachineSoundPhase } from "../game/machine-sound-helpers";
import { LeadInOutVoice, MachineVoice } from "../utils/machineVoice";
import { PlanerSynthVoice } from "../utils/planerSynth";
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

/**
 * Machines with a continuous voice. Machines not listed here (benches, the
 * miter saw — whose whole cycle is one short one-shot) keep the existing
 * one-shot path; both systems coexist.
 *
 * The planer pilots the pure-synth direction; a sample-based machine would
 * register `() => new LoopingSoundPlayer({ start: ..., runLoop: ..., ... })`
 * here instead (the placeholder planer-*.ogg clips are still in
 * static/sounds/ for that path).
 */
const MACHINE_VOICES: Partial<Record<MachineId, () => MachineVoice>> = {
  // Lead-in: the spin-up (~0.9s to full pitch) gets heard before the wood
  // bites. Lead-out: the motor audibly unloads before switching off.
  lunchboxPlaner: () =>
    new LeadInOutVoice(new PlanerSynthVoice(), {
      leadInMs: 1100,
      leadOutMs: 800,
    }),
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
        player = makeVoice();
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
