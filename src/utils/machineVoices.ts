import { MachineId } from "../game/Machine";
import {
  BAND_SAW_SYNTH_PARAMS,
  JOINTER_SYNTH_PARAMS,
  MachineSynthParams,
  MachineSynthVoice,
  MITER_SAW_SYNTH_PARAMS,
  PLANER_SYNTH_PARAMS,
  TABLE_SAW_SYNTH_PARAMS,
} from "./machineSynth";
import { PhaseReportingVoice } from "./machineSoundState";
import { LeadInOutVoice, LeadTimes, MachineVoice } from "./machineVoice";

/**
 * Which machines have a continuous voice, and what that voice is —
 * shared by both shells' machine-sound layers so a machine can't sound
 * like one thing in one world and another in the other.
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

export const MACHINE_VOICES: Partial<
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
  // Big wheels take their time coming up to speed, and coast for ages
  bandSaw: synthVoice(BAND_SAW_SYNTH_PARAMS, {
    leadInMs: 1800,
    leadOutMs: 1400,
  }),
};

/** Whether this machine type's visuals should follow the audible phase. */
export function machineHasVoice(machineTypeId: MachineId): boolean {
  return MACHINE_VOICES[machineTypeId] !== undefined;
}
