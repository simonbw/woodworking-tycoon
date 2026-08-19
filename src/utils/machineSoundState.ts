import { MachineSoundPhase } from "../game/machine-sound-helpers";
import { MachineVoice } from "./machineVoice";

/**
 * The audible phase of every machine with a continuous voice, published by
 * `MachineSoundView` and read by the machine arts. This is what keeps the
 * visuals honest: the lead-in/lead-out sequencing (`LeadInOutVoice`) lives
 * in wall-clock time inside the voice, so the shop's state alone can't tell
 * the art whether the machine is actually biting wood *right now* — this
 * store can. Blade animation and cut particles key off it (see
 * `deriveMachineVisuals`) so chips fly exactly while the cut is audible,
 * not during spin-up or wind-out.
 *
 * The voices publish once a frame, ahead of the draw, so the art reads the
 * phase the ear is hearing this frame.
 *
 * Keyed by the same `machineKey` the sound layer uses (type@x,y).
 */

const phases = new Map<string, MachineSoundPhase>();

export function getAudiblePhase(key: string): MachineSoundPhase {
  return phases.get(key) ?? "off";
}

/**
 * A pass-through voice that publishes every phase it forwards. Sits INSIDE
 * the `LeadInOutVoice` wrapper so the published phase is the sequenced,
 * audible one — the store shows "running" during lead-in even while the
 * game considers the operation underway.
 */
export class PhaseReportingVoice implements MachineVoice {
  constructor(
    private readonly key: string,
    private readonly inner: MachineVoice,
  ) {}

  setPhase(phase: MachineSoundPhase, load?: number): void {
    phases.set(this.key, phase);
    this.inner.setPhase(phase, load);
  }

  dispose(): void {
    phases.delete(this.key);
    this.inner.dispose();
  }
}
