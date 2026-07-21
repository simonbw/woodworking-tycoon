import React, { useEffect, useRef } from "react";
import { getMachines, MachineId, MachineState } from "../game/Machine";
import { deriveMachineCutLoad } from "../game/cut-load";
import { deriveMachineSoundPhase } from "../game/machine-sound-helpers";
import { PhaseReportingVoice } from "../utils/machineSoundState";
import {
  JOINTER_SYNTH_PARAMS,
  MachineSynthParams,
  MachineSynthVoice,
  MITER_SAW_SYNTH_PARAMS,
  PLANER_SYNTH_PARAMS,
  TABLE_SAW_SYNTH_PARAMS,
} from "../utils/machineSynth";
import { LeadInOutVoice, LeadTimes, MachineVoice } from "../utils/machineVoice";
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
 * garbage can) keep the one-shot path; both systems coexist. Every powered
 * machine uses the shared synth with its own params; a sample-based machine
 * would register a `LoopingSoundPlayer` inside the same wrappers.
 *
 * Wrapper order matters: LeadInOut sequences the phases, PhaseReporting
 * publishes the *sequenced* result to `machineSoundState` (which the
 * sprites' particles and animation read), and the synth renders it.
 *
 * Leads: how long the machine runs idle before the wood engages / after it
 * clears. The saws spin big blades (longer wind-up feels right); the miter
 * saw is a trigger tool — grab, squeeze, cut.
 */
function synthVoice(params: MachineSynthParams, leads: LeadTimes) {
  return (key: string) =>
    new LeadInOutVoice(
      new PhaseReportingVoice(key, new MachineSynthVoice(params)),
      leads,
    );
}

const MACHINE_VOICES: Partial<
  Record<MachineId, (key: string) => MachineVoice>
> = {
  lunchboxPlaner: synthVoice(PLANER_SYNTH_PARAMS, {
    leadInMs: 1100,
    leadOutMs: 800,
  }),
  jointer: synthVoice(JOINTER_SYNTH_PARAMS, {
    leadInMs: 900,
    leadOutMs: 600,
  }),
  jobsiteTableSaw: synthVoice(TABLE_SAW_SYNTH_PARAMS, {
    leadInMs: 1400,
    leadOutMs: 1000,
  }),
  miterSaw: synthVoice(MITER_SAW_SYNTH_PARAMS, {
    leadInMs: 250,
    leadOutMs: 200,
  }),
};

/** Whether this machine type's visuals should follow the audible phase. */
export function machineHasVoice(machineTypeId: MachineId): boolean {
  return MACHINE_VOICES[machineTypeId] !== undefined;
}

/**
 * Machines have no id; position is their identity (moving one in the layout
 * editor is a remove + re-add, which correctly retires the old player).
 * Shared with `useMachineActivity`, which reads the audible phase published
 * under the same key.
 */
export function machineKey(state: MachineState): string {
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
        player = makeVoice(key);
        players.set(key, player);
      }
      player.setPhase(
        deriveMachineSoundPhase(
          machine,
          gameState.player.position,
          gameState.player.away !== null,
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
