import { MachineSoundPhase } from "../game/machine-sound-helpers";

/**
 * A continuous sound backend for one placed machine. `MachineSoundLayer`
 * derives the desired phase from game state and converges the voice on it;
 * how the voice makes the sound — sample loops (`LoopingSoundPlayer`) or
 * pure synthesis (`PlanerSynthVoice`) — is its own business.
 */
export interface MachineVoice {
  setPhase(phase: MachineSoundPhase): void;
  /** Fast fade + release all audio resources. The voice is dead after this. */
  dispose(): void;
}

/**
 * Ordering used for transition debouncing: downward transitions (backing off
 * the operation cell, powering down) are debounced so tick-to-tick attendance
 * flapping doesn't stutter the audio; upward transitions are instant.
 */
export const PHASE_RANK: Record<MachineSoundPhase, number> = {
  off: 0,
  running: 1,
  cutting: 2,
};
