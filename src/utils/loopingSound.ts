import { MachineSoundPhase } from "../game/machine-sound-helpers";
import { getSfxBus } from "./audioBus";
import { getAudioContext } from "./getAudioContext";
import { MachineVoice, PHASE_RANK } from "./machineVoice";
import { loadSoundBuffer } from "./sfx";

/**
 * Continuous multi-phase machine sound: spin-up one-shot → idle/cutting
 * loops → wind-down one-shot (see `docs/sound-design.md`).
 *
 * The trick that keeps transitions click-free: when the machine turns on,
 * BOTH loops start simultaneously (the cutting loop at zero gain), so
 * running ↔ cutting is only ever two gain ramps — no source restarts and no
 * phase-alignment problems. The spin-up clip is played first with the loops
 * scheduled (sample-accurately, on the audio clock) to fade in under its
 * tail; wind-down fades the loops out under the stop clip.
 *
 * Like `sfx.ts`, everything is best-effort: any Web Audio or fetch failure
 * silences this player without throwing.
 */
export interface MachineSoundDef {
  /** Spin-up one-shot; must end at steady idle so the loop fade-in hides the seam. */
  readonly start?: string;
  /** Seamless idle loop. */
  readonly runLoop: string;
  /** Seamless under-load loop, recorded at the same level/position as runLoop. */
  readonly cutLoop?: string;
  /** Wind-down one-shot; must begin at steady idle. */
  readonly stop?: string;
  /** Overall trim for this machine's whole set. */
  readonly gain?: number;
  /** Fade length for phase transitions. */
  readonly crossfadeMs?: number;
}

const DEFAULT_CROSSFADE_MS = 60;

/**
 * Downward transitions (cutting→running, →off) wait this long before
 * committing, so tick-to-tick flapping — the player nudging one cell off the
 * operation spot — doesn't stutter the audio. Upward transitions are instant.
 */
const DOWNWARD_DEBOUNCE_MS = 250;

/** Idle-loop level while the cutting loop is dominant. */
const RUN_GAIN_WHILE_CUTTING = 0.15;

interface LoopGraph {
  readonly master: GainNode;
  readonly runGain: GainNode;
  readonly cutGain: GainNode | null;
  readonly sources: ReadonlyArray<AudioBufferSourceNode>;
}

interface LoadedBuffers {
  readonly start: AudioBuffer | null;
  readonly run: AudioBuffer;
  readonly cut: AudioBuffer | null;
  readonly stop: AudioBuffer | null;
}

export class LoopingSoundPlayer implements MachineVoice {
  private readonly def: MachineSoundDef;
  /** What the game wants right now. */
  private desired: MachineSoundPhase = "off";
  /** What the audio graph currently reflects. */
  private applied: MachineSoundPhase = "off";
  private pendingTimer: ReturnType<typeof setTimeout> | undefined;
  private buffers: LoadedBuffers | null = null;
  private loading = false;
  private failed = false;
  private disposed = false;
  private graph: LoopGraph | null = null;

  constructor(def: MachineSoundDef) {
    this.def = def;
  }

  setPhase(phase: MachineSoundPhase): void {
    if (this.disposed || phase === this.desired) return;
    this.desired = phase;
    clearTimeout(this.pendingTimer);
    if (PHASE_RANK[phase] < PHASE_RANK[this.applied]) {
      this.pendingTimer = setTimeout(
        () => this.reconcile(),
        DOWNWARD_DEBOUNCE_MS,
      );
    } else {
      this.reconcile();
    }
  }

  /** Fade out fast and release all audio nodes. The player is dead after this. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    clearTimeout(this.pendingTimer);
    try {
      if (this.graph) {
        const ctx = getAudioContext();
        this.graph.master.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
        this.stopAndRelease(this.graph, ctx.currentTime + 0.1);
        this.graph = null;
      }
    } catch {
      // Best-effort teardown.
    }
  }

  private reconcile(): void {
    if (this.disposed || this.failed) return;
    if (!this.buffers) {
      this.ensureLoaded();
      return;
    }
    if (this.desired === this.applied) return;

    try {
      if (this.applied === "off") {
        this.spinUp(this.desired);
      } else if (this.desired === "off") {
        this.windDown();
      } else {
        this.crossfadeTo(this.desired);
      }
      this.applied = this.desired;
    } catch {
      // A broken graph must never break the game; go quiet instead.
      this.failed = true;
    }
  }

  private ensureLoaded(): void {
    if (this.loading) return;
    this.loading = true;
    const load = (name: string | undefined) =>
      name === undefined
        ? Promise.resolve(null)
        : loadSoundBuffer(name).catch(() => null);
    void Promise.all([
      load(this.def.start),
      loadSoundBuffer(this.def.runLoop).catch(() => null),
      load(this.def.cutLoop),
      load(this.def.stop),
    ]).then(([start, run, cut, stop]) => {
      // The one-shots are garnish, but without the core loop there is no
      // machine sound — give up quietly rather than retry every frame.
      if (!run) {
        this.failed = true;
        return;
      }
      this.buffers = { start, run, cut, stop };
      this.reconcile();
    });
  }

  private get crossfadeSec(): number {
    return (this.def.crossfadeMs ?? DEFAULT_CROSSFADE_MS) / 1000;
  }

  /** Ramp a gain toward a target; timeConstant ≈ fade/3 lands it in ~one fade. */
  private ramp(param: AudioParam, target: number, startTime: number): void {
    param.setTargetAtTime(target, startTime, this.crossfadeSec / 3);
  }

  private playOneShot(buffer: AudioBuffer, destination: AudioNode): void {
    const ctx = getAudioContext();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(destination);
    source.start();
  }

  private spinUp(target: MachineSoundPhase): void {
    const buffers = this.buffers!;
    const ctx = getAudioContext();
    // The context may still be suspended before the first user gesture;
    // resume is idempotent and the scheduled graph plays once it unlocks.
    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => {});
    }

    const master = ctx.createGain();
    master.gain.value = this.def.gain ?? 1;
    master.connect(getSfxBus());

    // Loops enter under the tail of the spin-up clip.
    let loopStart = ctx.currentTime;
    if (buffers.start) {
      this.playOneShot(buffers.start, master);
      loopStart = Math.max(
        ctx.currentTime,
        ctx.currentTime + buffers.start.duration - this.crossfadeSec,
      );
    }

    const startLoop = (buffer: AudioBuffer, gainValue: number) => {
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, loopStart);
      this.ramp(gain.gain, gainValue, loopStart);
      gain.connect(master);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(gain);
      source.start(loopStart);
      return { gain, source };
    };

    const cutting = target === "cutting" && buffers.cut !== null;
    const run = startLoop(buffers.run, cutting ? RUN_GAIN_WHILE_CUTTING : 1);
    const cut = buffers.cut ? startLoop(buffers.cut, cutting ? 1 : 0) : null;

    this.graph = {
      master,
      runGain: run.gain,
      cutGain: cut?.gain ?? null,
      sources: cut ? [run.source, cut.source] : [run.source],
    };
  }

  private crossfadeTo(target: MachineSoundPhase): void {
    const graph = this.graph;
    if (!graph) return;
    const now = getAudioContext().currentTime;
    const cutting = target === "cutting" && graph.cutGain !== null;
    this.ramp(graph.runGain.gain, cutting ? RUN_GAIN_WHILE_CUTTING : 1, now);
    if (graph.cutGain) {
      this.ramp(graph.cutGain.gain, cutting ? 1 : 0, now);
    }
  }

  private windDown(): void {
    const graph = this.graph;
    this.graph = null;
    if (!graph) return;
    const buffers = this.buffers!;
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // Fade the loops out under the wind-down clip, then release the nodes.
    this.ramp(graph.runGain.gain, 0, now);
    if (graph.cutGain) this.ramp(graph.cutGain.gain, 0, now);
    if (buffers.stop) {
      this.playOneShot(buffers.stop, graph.master);
    }
    this.stopAndRelease(graph, now + this.crossfadeSec * 4);
  }

  /**
   * Stop the loop sources at `when` and disconnect the graph once the last
   * one actually ends (which is after any one-shot routed through master has
   * had its say, since `when` trails the audible fade).
   */
  private stopAndRelease(graph: LoopGraph, when: number): void {
    const last = graph.sources[graph.sources.length - 1];
    const stopBuffer = this.buffers?.stop;
    last.onended = () => {
      // Give a playing wind-down clip time to finish before disconnecting.
      const graceMs = stopBuffer ? stopBuffer.duration * 1000 : 0;
      setTimeout(() => {
        try {
          graph.master.disconnect();
        } catch {
          // Already disconnected — fine.
        }
      }, graceMs);
    };
    graph.sources.forEach((source) => source.stop(when));
  }
}
