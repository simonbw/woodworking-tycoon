import { useSyncExternalStore } from "react";
import { MachineSoundPhase } from "../game/machine-sound-helpers";
import { MachineVoice } from "./machineVoice";

/**
 * The audible phase of every machine with a continuous voice, published by
 * the sound layer and read by the sprites. This is what keeps the visuals
 * honest: the lead-in/lead-out sequencing (`LeadInOutVoice`) lives in
 * wall-clock time inside the sound layer, so game state alone can't tell a
 * sprite whether the machine is actually biting wood *right now* — this
 * store can. Blade animation and cut particles key off it so chips fly
 * exactly while the cut is audible, not during spin-up or wind-out.
 *
 * Keyed by the same `machineKey` the sound layer uses (type@x,y).
 */

const phases = new Map<string, MachineSoundPhase>();
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getAudiblePhase(key: string): MachineSoundPhase {
  return phases.get(key) ?? "off";
}

/** React to a machine's audible phase (re-renders on change). */
export function useAudiblePhase(key: string): MachineSoundPhase {
  return useSyncExternalStore(subscribe, () => getAudiblePhase(key));
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

  setPhase(phase: MachineSoundPhase): void {
    if (getAudiblePhase(this.key) !== phase) {
      phases.set(this.key, phase);
      notify();
    }
    this.inner.setPhase(phase);
  }

  dispose(): void {
    if (phases.delete(this.key)) {
      notify();
    }
    this.inner.dispose();
  }
}
