import { MachineSoundPhase } from "../game/machine-sound-helpers";

/**
 * A continuous sound backend for one placed machine. `MachineSoundLayer`
 * derives the desired phase from game state and converges the voice on it;
 * how the voice makes the sound — sample loops (`LoopingSoundPlayer`) or
 * pure synthesis (`PlanerSynthVoice`) — is its own business.
 */
export interface MachineVoice {
  /**
   * `load` is the strain scalar from `deriveMachineCutLoad` — how much wood
   * the cut is taking off, 1 = the voice's reference tuning. Voices that
   * can't express it (sample loops) just ignore it.
   */
  setPhase(phase: MachineSoundPhase, load?: number): void;
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

export interface LeadTimes {
  /** Machine-on-but-idle time between power-on and the wood engaging. */
  readonly leadInMs: number;
  /** Idle time between the cut disengaging and the power switch going off. */
  readonly leadOutMs: number;
}

/**
 * Wraps a voice to bracket the cut with idle time, the way the real machine
 * is used: switch on, let it come up to speed, THEN feed the board — and the
 * board clears the knives before the switch goes off. Without this, an
 * operation starting from cold would jump straight into the cut (burying the
 * spin-up) and the cut buzz would die at the exact instant the operation
 * completes instead of the motor audibly unloading first.
 *
 * Only off ↔ cutting transitions are sequenced. A machine already idling
 * (player returning mid-operation) re-engages the wood immediately, and
 * plain running → off is just a wind-down. Pure timing logic — no Web Audio —
 * so it wraps sample-based and synth voices alike.
 */
export class LeadInOutVoice implements MachineVoice {
  private desired: MachineSoundPhase = "off";
  private load = 1;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly inner: MachineVoice,
    private readonly leads: LeadTimes,
  ) {}

  setPhase(phase: MachineSoundPhase, load = 1): void {
    const loadChanged = load !== this.load;
    this.load = load;
    if (phase === this.desired) {
      // A load-only change (different stock, same phase): forward it unless
      // a pending lead timer will deliver the stored load anyway.
      if (loadChanged && this.timer === undefined) {
        this.inner.setPhase(phase, load);
      }
      return;
    }
    const previous = this.desired;
    this.desired = phase;
    clearTimeout(this.timer);
    this.timer = undefined;

    if (phase === "cutting" && previous === "off") {
      // Spin up and settle at idle before the wood bites.
      this.inner.setPhase("running", load);
      this.timer = setTimeout(() => {
        this.timer = undefined;
        if (this.desired === "cutting") {
          this.inner.setPhase("cutting", this.load);
        }
      }, this.leads.leadInMs);
    } else if (phase === "off" && previous === "cutting") {
      // The board clears the knives; the motor idles, then winds down.
      this.inner.setPhase("running", load);
      this.timer = setTimeout(() => {
        this.timer = undefined;
        if (this.desired === "off") {
          this.inner.setPhase("off", this.load);
        }
      }, this.leads.leadOutMs);
    } else {
      this.inner.setPhase(phase, load);
    }
  }

  dispose(): void {
    clearTimeout(this.timer);
    this.inner.dispose();
  }
}
