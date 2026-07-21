import { MachineSoundPhase } from "../game/machine-sound-helpers";
import { getSfxBus } from "./audioBus";
import { getAudioContext } from "./getAudioContext";
import { MachineVoice, PHASE_RANK } from "./machineVoice";

/**
 * A fully synthesized lunchbox planer, no samples (see `docs/sound-design.md`,
 * "Pure-synth experiment"). Three modules, each modeling a physical noise
 * source, all driven by a single `rpm` scalar:
 *
 *  MOTOR — a ~10k RPM universal motor (≈168 Hz rotation). The low growl is a
 *    sawtooth at rotation frequency through a lowpass; the signature planer
 *    scream is NOT the rotation but the armature slot-pass partial up around
 *    14× rotation (~2.3 kHz) — modeled as two slightly detuned sines whose
 *    beating gives the shimmer real motors have.
 *
 *  AIR — fan + cutterhead windage: broadband noise through a bandpass whose
 *    center frequency and level both track rpm (aerodynamic noise rises
 *    steeply with speed, so it also dies fastest on wind-down).
 *
 *  CUT — a 2-knife cutterhead at 168 Hz rotation strikes the board ~336
 *    times a second: far too fast to hear as impacts, it fuses into the
 *    pitched buzz that IS the planer-cut sound. Modeled as noise
 *    amplitude-modulated by a square wave at knife-pass frequency, shaped by
 *    three "wood body" formant resonances plus a broadband bed, with a slow
 *    filtered-noise wander on the whole cut level so the texture breathes
 *    like grain variation instead of holding statically.
 *
 * Because every frequency derives from `rpm`, spin-up and wind-down are just
 * ramps on that one scalar (`setTargetAtTime`'s exponential approach is a
 * motor spin-up curve), and cutting SAGS rpm a few percent — the entire
 * spectrum drops together under load, which is the tell that makes it read
 * as one machine biting into wood rather than layered tracks.
 *
 * Like the sample player, everything is best-effort: any Web Audio failure
 * silences the voice without throwing.
 */

/** All tuning in one place — tweak freely, nothing else encodes sound. */
export const PLANER_SYNTH_PARAMS = {
  /** Overall trim into the SFX bus. */
  master: 0.35,
  /** Cutterhead rotation at full speed: ≈10k RPM. Everything scales off this. */
  rotationHz: 168,
  /** rpm is 1 at idle; cutting bogs the motor down a touch. */
  cutRpmSag: 0.94,
  motor: {
    /**
     * Sawtooth growl at rotation frequency, kept dark by this lowpass. A
     * lunchbox planer is a small, light machine — its idle is nearly all
     * scream, so the growl sits low and mostly earns its keep under load.
     */
    gain: 0.08,
    cutGainBoost: 2.4,
    lowpassHz: 1400,
    /** Slot-pass scream: partial number and detune between the sine pair. */
    whineRatio: 14,
    whineDetune: 1.006,
    whineGain: 0.1,
    /** Second slot-pass harmonic, relative to whineGain — adds the edge. */
    whineOctave: 0.35,
    /** The scream hardens as motor current rises under load. */
    whineCutBoost: 1.6,
  },
  air: {
    gain: 0.12,
    /** The knives churning chips throw far more air than free spinning. */
    cutBoost: 1.5,
    /** Bandpass center at full speed; tracks rpm so the whoosh pitches up. */
    bandpassHz: 1500,
    q: 0.5,
  },
  cut: {
    gain: 1.0,
    /** AM depth of the knife-pass chop (square wave, 2 knives). */
    knives: 2,
    chopDepth: 0.45,
    /** Wood-body resonances the chopped noise rings through. */
    formants: [
      { hz: 900, q: 3, gain: 1.0 },
      { hz: 1850, q: 4, gain: 0.6 },
      { hz: 3200, q: 5, gain: 0.45 },
    ],
    /** Unresonant broadband tearing under the formants. */
    bedLowpassHz: 4500,
    bedGain: 0.5,
    /**
     * Grain wander: noise lowpassed to ~5 Hz modulates the cut level. The
     * scale looks huge because a 5 Hz-lowpassed unit noise has tiny RMS
     * (~0.015); this lands the wobble around ±30%.
     */
    wanderHz: 5,
    wanderScale: 18,
  },
  /** Time constants (s). Wind-down pitch outlasts its noise: coasting. */
  spinUp: { freqTau: 0.22, gainTau: 0.15 },
  windDown: { freqTau: 0.7, motorGainTau: 0.35, airGainTau: 0.2 },
  /** Cut gate + load sag speed for running ↔ cutting. */
  cutTau: { engage: 0.05, release: 0.15, rpm: 0.25 },
  /** Debounce for downward transitions (attendance flapping). */
  downwardDebounceMs: 250,
} as const;

let noiseBuffer: AudioBuffer | null = null;

/** 2s of white noise, shared by every consumer (they loop from random offsets). */
function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (!noiseBuffer) {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    noiseBuffer = buffer;
  }
  return noiseBuffer;
}

interface SynthGraph {
  readonly master: GainNode;
  readonly motorGain: GainNode;
  readonly whineGain: GainNode;
  readonly airGain: GainNode;
  readonly cutGate: GainNode;
  readonly airBandpass: BiquadFilterNode;
  /** Everything whose frequency scales with rpm: [node param, full-speed Hz]. */
  readonly pitched: ReadonlyArray<readonly [AudioParam, number]>;
  readonly sources: ReadonlyArray<AudioScheduledSourceNode>;
}

export class PlanerSynthVoice implements MachineVoice {
  private desired: MachineSoundPhase = "off";
  private applied: MachineSoundPhase = "off";
  private pendingTimer: ReturnType<typeof setTimeout> | undefined;
  private graph: SynthGraph | null = null;
  private failed = false;
  private disposed = false;

  setPhase(phase: MachineSoundPhase): void {
    if (this.disposed || phase === this.desired) return;
    this.desired = phase;
    clearTimeout(this.pendingTimer);
    if (PHASE_RANK[phase] < PHASE_RANK[this.applied]) {
      this.pendingTimer = setTimeout(
        () => this.apply(),
        PLANER_SYNTH_PARAMS.downwardDebounceMs,
      );
    } else {
      this.apply();
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    clearTimeout(this.pendingTimer);
    try {
      if (this.graph) {
        const ctx = getAudioContext();
        this.graph.master.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
        const graph = this.graph;
        this.graph = null;
        graph.sources.forEach((s) => s.stop(ctx.currentTime + 0.2));
        setTimeout(() => {
          try {
            graph.master.disconnect();
          } catch {
            // Already disconnected — fine.
          }
        }, 300);
      }
    } catch {
      // Best-effort teardown.
    }
  }

  private apply(): void {
    if (this.disposed || this.failed) return;
    const previous = this.applied;
    const phase = this.desired;
    if (phase === previous) return;
    try {
      // Never build the graph just to be silent.
      if (!this.graph) {
        if (phase === "off") return;
        this.graph = this.build();
      }
      this.transition(previous, phase);
      this.applied = phase;
    } catch {
      // A broken graph must never break the game; go quiet instead.
      this.failed = true;
    }
  }

  /** Construct the full node graph, all gains at zero, sources running. */
  private build(): SynthGraph {
    const P = PLANER_SYNTH_PARAMS;
    const ctx = getAudioContext();
    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => {});
    }
    const noise = getNoiseBuffer(ctx);
    const sources: AudioScheduledSourceNode[] = [];
    const pitched: Array<readonly [AudioParam, number]> = [];

    const master = ctx.createGain();
    master.gain.value = P.master;
    master.connect(getSfxBus());

    const osc = (type: OscillatorType, fullSpeedHz: number) => {
      const node = ctx.createOscillator();
      node.type = type;
      node.frequency.value = 0;
      pitched.push([node.frequency, fullSpeedHz]);
      node.start();
      sources.push(node);
      return node;
    };
    const noiseSrc = () => {
      const node = ctx.createBufferSource();
      node.buffer = noise;
      node.loop = true;
      node.start(0, Math.random() * noise.duration);
      sources.push(node);
      return node;
    };

    // ----- MOTOR: rotation growl + slot-pass scream ------------------------
    const motorGain = ctx.createGain();
    motorGain.gain.value = 0;
    const motorLowpass = ctx.createBiquadFilter();
    motorLowpass.type = "lowpass";
    motorLowpass.frequency.value = P.motor.lowpassHz;
    osc("sawtooth", P.rotationHz).connect(motorLowpass);
    motorLowpass.connect(motorGain).connect(master);

    const whineGain = ctx.createGain();
    whineGain.gain.value = 0;
    const whineHz = P.rotationHz * P.motor.whineRatio;
    osc("sine", whineHz).connect(whineGain);
    osc("sine", whineHz * P.motor.whineDetune).connect(whineGain);
    // Octave partial rides inside whineGain at a fixed relative level, so
    // level and boost changes move the whole scream together.
    const whineOctave = ctx.createGain();
    whineOctave.gain.value = P.motor.whineOctave;
    osc("sine", whineHz * 2 * P.motor.whineDetune).connect(whineOctave);
    whineOctave.connect(whineGain);
    whineGain.connect(master);

    // ----- AIR: rpm-tracking whoosh ----------------------------------------
    const airGain = ctx.createGain();
    airGain.gain.value = 0;
    const airBandpass = ctx.createBiquadFilter();
    airBandpass.type = "bandpass";
    airBandpass.frequency.value = 0;
    airBandpass.Q.value = P.air.q;
    noiseSrc().connect(airBandpass);
    airBandpass.connect(airGain).connect(master);

    // ----- CUT: knife-chopped noise through wood formants ------------------
    // AM: chop.gain sits at (1 - depth) and the square modulator adds ±depth,
    // so the noise level swings between (1 - 2·depth) and 1 at knife rate.
    const chop = ctx.createGain();
    chop.gain.value = 1 - P.cut.chopDepth;
    const chopDepth = ctx.createGain();
    chopDepth.gain.value = P.cut.chopDepth;
    osc("square", P.rotationHz * P.cut.knives).connect(chopDepth);
    chopDepth.connect(chop.gain);
    noiseSrc().connect(chop);

    // Formants + bed sum into a mix whose gain carries the grain wander.
    const cutMix = ctx.createGain();
    cutMix.gain.value = 1;
    for (const formant of P.cut.formants) {
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = formant.hz;
      bp.Q.value = formant.q;
      const g = ctx.createGain();
      g.gain.value = formant.gain;
      chop.connect(bp).connect(g).connect(cutMix);
    }
    const bed = ctx.createBiquadFilter();
    bed.type = "lowpass";
    bed.frequency.value = P.cut.bedLowpassHz;
    const bedGain = ctx.createGain();
    bedGain.gain.value = P.cut.bedGain;
    chop.connect(bed).connect(bedGain).connect(cutMix);

    // Grain wander: for noise content a negative gain excursion is just a
    // polarity flip (inaudible), so unclamped modulation is safe here.
    const wanderLowpass = ctx.createBiquadFilter();
    wanderLowpass.type = "lowpass";
    wanderLowpass.frequency.value = P.cut.wanderHz;
    const wanderScale = ctx.createGain();
    wanderScale.gain.value = P.cut.wanderScale;
    noiseSrc().connect(wanderLowpass);
    wanderLowpass.connect(wanderScale).connect(cutMix.gain);

    const cutGate = ctx.createGain();
    cutGate.gain.value = 0;
    cutMix.connect(cutGate).connect(master);

    return {
      master,
      motorGain,
      whineGain,
      airGain,
      cutGate,
      airBandpass,
      pitched,
      sources,
    };
  }

  /** Ramp the graph from one phase's targets to another's. */
  private transition(from: MachineSoundPhase, to: MachineSoundPhase): void {
    const P = PLANER_SYNTH_PARAMS;
    const graph = this.graph!;
    const ctx = getAudioContext();
    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;
    const rpm = to === "off" ? 0 : to === "cutting" ? P.cutRpmSag : 1;
    const powerChange = (from === "off") !== (to === "off");

    // Pitch: one time constant for every rpm-scaled frequency, so the whole
    // spectrum moves together. Power transitions use the spin-up/coast-down
    // curves; the running ↔ cutting load sag is quicker and subtler.
    const freqTau = !powerChange
      ? P.cutTau.rpm
      : to === "off"
        ? P.windDown.freqTau
        : P.spinUp.freqTau;
    for (const [param, fullSpeedHz] of graph.pitched) {
      param.setTargetAtTime(fullSpeedHz * rpm, now, freqTau);
    }
    graph.airBandpass.frequency.setTargetAtTime(
      P.air.bandpassHz * rpm,
      now,
      freqTau,
    );

    // Levels. On wind-down the air noise dies faster than the pitch falls
    // (a coasting cutterhead moves less air but still whistles down). Under
    // load EVERY module gets louder — the real idle → cutting jump is huge,
    // and it has to come from the whole machine working harder, not just
    // the cut layer appearing.
    const off = to === "off";
    const cutting = to === "cutting";
    const motorTau = off ? P.windDown.motorGainTau : P.spinUp.gainTau;
    const airTau = off ? P.windDown.airGainTau : P.spinUp.gainTau;
    graph.motorGain.gain.setTargetAtTime(
      off ? 0 : P.motor.gain * (cutting ? P.motor.cutGainBoost : 1),
      now,
      motorTau,
    );
    graph.whineGain.gain.setTargetAtTime(
      off ? 0 : P.motor.whineGain * (cutting ? P.motor.whineCutBoost : 1),
      now,
      motorTau,
    );
    graph.airGain.gain.setTargetAtTime(
      off ? 0 : P.air.gain * (cutting ? P.air.cutBoost : 1),
      now,
      airTau,
    );
    graph.cutGate.gain.setTargetAtTime(
      to === "cutting" ? P.cut.gain : 0,
      now,
      to === "cutting" ? P.cutTau.engage : P.cutTau.release,
    );

    // The power switch itself: a tiny filtered-noise thunk.
    if (powerChange) {
      this.switchClick(to === "off" ? 0.25 : 0.4);
    }
  }

  /** Short bandpassed noise burst — the physical switch snapping over. */
  private switchClick(level: number): void {
    const ctx = getAudioContext();
    const graph = this.graph;
    if (!graph) return;
    const source = ctx.createBufferSource();
    source.buffer = getNoiseBuffer(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2500;
    bp.Q.value = 1.5;
    const env = ctx.createGain();
    const now = ctx.currentTime;
    env.gain.setValueAtTime(level, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    source.connect(bp).connect(env).connect(graph.master);
    source.start(now, Math.random(), 0.05);
  }
}
