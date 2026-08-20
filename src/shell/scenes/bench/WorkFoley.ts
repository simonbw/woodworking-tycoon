import { getSfxBus } from "../../../utils/audioBus";
import { getAudioContext } from "../../../utils/getAudioContext";
import { loadSoundBuffer } from "../../../utils/sfx";

/**
 * Continuous tool foley for bench hand work: the given clip loops while
 * the tool is cutting and fades out when it stops. The old view's
 * `useWorkFoley` as a plain object, so an engine view can own one —
 * same graph, same fades. Best-effort like every other sound: failures
 * silence it, never throw.
 */
export class WorkFoley {
  private clip: string | null = null;
  private graph: { source: AudioBufferSourceNode; gain: GainNode } | null =
    null;
  /** Bumped on every start; a load that finishes late is discarded. */
  private generation = 0;

  /** Run `clip` (null for silence) at this level. Idempotent per clip. */
  set(clip: string | null, gain = 0.5): void {
    if (clip === this.clip) return;
    this.clip = clip;
    this.stop();
    if (!clip) return;
    const generation = ++this.generation;
    loadSoundBuffer(clip)
      .then((buffer) => {
        if (generation !== this.generation) return;
        const ctx = getAudioContext();
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        const node = ctx.createGain();
        // Quick fade in so a stroke doesn't click on.
        node.gain.setValueAtTime(0, ctx.currentTime);
        node.gain.linearRampToValueAtTime(gain, ctx.currentTime + 0.06);
        source.connect(node).connect(getSfxBus());
        source.start();
        this.graph = { source, gain: node };
      })
      .catch(() => {});
  }

  /** Fade out and release — no click on letting go. */
  stop(): void {
    this.generation++;
    const graph = this.graph;
    this.graph = null;
    this.clip = null;
    if (!graph) return;
    try {
      const ctx = getAudioContext();
      graph.gain.gain.cancelScheduledValues(ctx.currentTime);
      graph.gain.gain.setValueAtTime(graph.gain.gain.value, ctx.currentTime);
      graph.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.08);
      graph.source.stop(ctx.currentTime + 0.1);
    } catch {
      // Already stopped; nothing to release.
    }
  }
}

/**
 * The looping clip a stroke operation works to. The hand saw is absent
 * on purpose: it carries its own synthesized voice, driven per stroke
 * (handSawSynth.ts), not a looped clip.
 */
export function foleyClipFor(operationId: string): string | null {
  if (operationId.startsWith("block")) return "hand-sanding";
  if (operationId.startsWith("orbit")) return "orbital-sander";
  if (operationId.startsWith("handPlane")) return "hand-sanding";
  return null;
}
