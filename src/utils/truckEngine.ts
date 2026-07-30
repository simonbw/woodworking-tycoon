import { getSfxBus } from "./audioBus";
import { getAudioContext } from "./getAudioContext";

/**
 * The truck's engine, synthesized like the machine voices (machineSynth):
 * no samples, one `firingHz` scalar the whole spectrum hangs off. An old
 * small pickup at idle fires around 35 Hz — the model is a detuned
 * sawtooth pair through a dark lowpass (the block), a sub sine an octave
 * down (the exhaust fundamental), and noise AM-chopped at firing rate
 * through a low lowpass (the exhaust burble). Starting is a starter-motor
 * whine amplitude-chugged at crank rate; leaving is a rev and a fade;
 * arriving is the same voice already rolling, throttled down, shut off,
 * and capped with the parking brake and the door.
 *
 * Routed dry through the SFX bus: the driveway is outdoors, and the room
 * bus wears the garage's impulse response.
 *
 * Best-effort like every voice here — any Web Audio failure goes quiet
 * without throwing.
 */

const IDLE_HZ = 35;

interface EngineGraph {
  readonly master: GainNode;
  readonly engineGain: GainNode;
  /** Every param that tracks the firing rate: [param, ratio to firingHz]. */
  readonly pitched: ReadonlyArray<readonly [AudioParam, number]>;
  readonly sources: AudioScheduledSourceNode[];
  readonly ctx: AudioContext;
}

let noiseBuffer: AudioBuffer | null = null;

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

/** Build the engine voice with every gain at zero and sources running. */
function buildEngine(stopAt: number): EngineGraph {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") {
    void ctx.resume().catch(() => {});
  }
  const sources: AudioScheduledSourceNode[] = [];
  const pitched: Array<readonly [AudioParam, number]> = [];

  const master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(getSfxBus());

  const osc = (type: OscillatorType, ratio: number) => {
    const node = ctx.createOscillator();
    node.type = type;
    node.frequency.value = 0;
    pitched.push([node.frequency, ratio]);
    node.start();
    node.stop(stopAt);
    sources.push(node);
    return node;
  };
  const noiseSrc = () => {
    const node = ctx.createBufferSource();
    node.buffer = getNoiseBuffer(ctx);
    node.loop = true;
    node.start(0, Math.random() * 2);
    node.stop(stopAt);
    sources.push(node);
    return node;
  };

  const engineGain = ctx.createGain();
  engineGain.gain.value = 0;
  engineGain.connect(master);

  // The block: detuned sawtooth pair, kept dark.
  const blockLowpass = ctx.createBiquadFilter();
  blockLowpass.type = "lowpass";
  blockLowpass.frequency.value = 260;
  const blockGain = ctx.createGain();
  blockGain.gain.value = 0.5;
  osc("sawtooth", 1).connect(blockLowpass);
  osc("sawtooth", 1.01).connect(blockLowpass);
  blockLowpass.connect(blockGain).connect(engineGain);

  // The exhaust fundamental, an octave down.
  const subGain = ctx.createGain();
  subGain.gain.value = 0.6;
  osc("sine", 0.5).connect(subGain).connect(engineGain);

  // The burble: noise chopped at firing rate, very low-passed.
  const chop = ctx.createGain();
  chop.gain.value = 0.5;
  const chopDepth = ctx.createGain();
  chopDepth.gain.value = 0.5;
  osc("square", 1).connect(chopDepth);
  chopDepth.connect(chop.gain);
  const burbleLowpass = ctx.createBiquadFilter();
  burbleLowpass.type = "lowpass";
  burbleLowpass.frequency.value = 140;
  const burbleGain = ctx.createGain();
  burbleGain.gain.value = 0.9;
  noiseSrc().connect(chop);
  chop.connect(burbleLowpass).connect(burbleGain).connect(engineGain);

  return { master, engineGain, pitched, sources, ctx };
}

/** Set every pitched param toward `hz` with one time constant. */
function setFiring(graph: EngineGraph, hz: number, at: number, tau: number) {
  for (const [param, ratio] of graph.pitched) {
    param.setTargetAtTime(hz * ratio, at, tau);
  }
}

/** A short filtered-noise burst — a latch, a brake, a door. */
function thunk(
  graph: EngineGraph,
  at: number,
  centerHz: number,
  level: number,
  length = 0.06,
): void {
  const { ctx } = graph;
  const source = ctx.createBufferSource();
  source.buffer = getNoiseBuffer(ctx);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = centerHz;
  bp.Q.value = 1.2;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(level, at + 0.005);
  env.gain.exponentialRampToValueAtTime(0.001, at + length);
  source.connect(bp).connect(env).connect(graph.master);
  source.start(at, Math.random(), length + 0.05);
}

/** The starter motor: a whine chugged at crank rate for `length` seconds. */
function crank(graph: EngineGraph, at: number, length: number): void {
  const { ctx } = graph;
  const whine = ctx.createOscillator();
  whine.type = "sawtooth";
  whine.frequency.setValueAtTime(150, at);
  whine.frequency.linearRampToValueAtTime(190, at + length);
  const chug = ctx.createGain();
  chug.gain.value = 0.1;
  const chugDepth = ctx.createGain();
  chugDepth.gain.value = 0.07;
  const chugLfo = ctx.createOscillator();
  chugLfo.type = "square";
  chugLfo.frequency.value = 9;
  chugLfo.connect(chugDepth);
  chugDepth.connect(chug.gain);
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 900;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(1, at + 0.03);
  env.gain.setValueAtTime(1, at + length - 0.03);
  env.gain.linearRampToValueAtTime(0, at + length);
  whine.connect(chug).connect(lowpass).connect(env).connect(graph.master);
  whine.start(at);
  whine.stop(at + length + 0.1);
  chugLfo.start(at);
  chugLfo.stop(at + length + 0.1);
  graph.sources.push(whine, chugLfo);
}

/** Key on, crank, catch, rev, and pull away — about three seconds. */
export function playTruckDeparture(): void {
  try {
    const ctx = getAudioContext();
    const t = ctx.currentTime;
    const graph = buildEngine(t + 4);

    crank(graph, t + 0.05, 0.65);

    // The catch: firing climbs from a stumble to idle, level comes up.
    setFiring(graph, 20, t, 0.001);
    setFiring(graph, IDLE_HZ, t + 0.65, 0.12);
    graph.engineGain.gain.setValueAtTime(0, t + 0.6);
    graph.engineGain.gain.setTargetAtTime(1, t + 0.65, 0.1);
    // A settle blip right off the start, like a cold fast-idle.
    setFiring(graph, 48, t + 0.8, 0.08);
    setFiring(graph, IDLE_HZ, t + 1.05, 0.2);

    // Pull away: revs climb, the whole voice recedes.
    setFiring(graph, 75, t + 1.5, 0.45);
    graph.master.gain.setValueAtTime(0.5, t + 1.5);
    graph.master.gain.setTargetAtTime(0, t + 1.7, 0.55);
  } catch {
    // Silence over crashes, always.
  }
}

/** Roll up, throttle down, park, and shut off — about three seconds. */
export function playTruckArrival(): void {
  try {
    const ctx = getAudioContext();
    const t = ctx.currentTime;
    const graph = buildEngine(t + 4);

    // Already rolling somewhere up the street, closing in.
    setFiring(graph, 65, t, 0.001);
    graph.engineGain.gain.setValueAtTime(1, t);
    graph.master.gain.setValueAtTime(0, t);
    graph.master.gain.setTargetAtTime(0.5, t, 0.4);

    // Off the throttle, settle to idle while backing in.
    setFiring(graph, IDLE_HZ, t + 0.7, 0.3);

    // Key off: firing collapses, one last exhaust sigh.
    setFiring(graph, 12, t + 1.9, 0.08);
    graph.engineGain.gain.setTargetAtTime(0, t + 1.95, 0.09);

    // The parking brake ratchets on; the door shuts behind the driver.
    thunk(graph, t + 2.35, 1600, 0.35, 0.08);
    thunk(graph, t + 2.75, 320, 0.5, 0.09);
  } catch {
    // Silence over crashes, always.
  }
}
