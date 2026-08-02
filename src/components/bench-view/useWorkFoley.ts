import { useCallback, useEffect, useRef, useState } from "react";
import { getSfxBus } from "../../utils/audioBus";
import { getAudioContext } from "../../utils/getAudioContext";
import { loadSoundBuffer } from "../../utils/sfx";

/**
 * Continuous tool foley for bench hand work: loop the given clip while
 * `active` is true, UI-side the way UiSoundLayer works — the completion
 * stinger still goes through the SoundEvent queue as usual. Best-effort
 * like every other sound: failures silence it, never throw.
 */
export function useWorkFoley(clip: string | null, active: boolean, gain = 0.5) {
  const graphRef = useRef<{
    source: AudioBufferSourceNode;
    gainNode: GainNode;
  } | null>(null);

  useEffect(() => {
    if (!clip || !active) {
      return;
    }
    let cancelled = false;
    loadSoundBuffer(clip)
      .then((buffer) => {
        if (cancelled) return;
        const ctx = getAudioContext();
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        const gainNode = ctx.createGain();
        // Quick fade in so a stroke doesn't click on
        gainNode.gain.setValueAtTime(0, ctx.currentTime);
        gainNode.gain.linearRampToValueAtTime(gain, ctx.currentTime + 0.06);
        source.connect(gainNode).connect(getSfxBus());
        source.start();
        graphRef.current = { source, gainNode };
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      const graph = graphRef.current;
      graphRef.current = null;
      if (graph) {
        try {
          const ctx = getAudioContext();
          // Fade out over a few ms, then stop — no click on release
          graph.gainNode.gain.cancelScheduledValues(ctx.currentTime);
          graph.gainNode.gain.setValueAtTime(
            graph.gainNode.gain.value,
            ctx.currentTime,
          );
          graph.gainNode.gain.linearRampToValueAtTime(
            0,
            ctx.currentTime + 0.08,
          );
          graph.source.stop(ctx.currentTime + 0.1);
        } catch {
          // Already stopped; nothing to release.
        }
      }
    };
  }, [clip, active, gain]);
}

/**
 * Debounced "the tool is moving" flag: call `poke()` on every work
 * event; `active` turns false once none arrive for `holdMs`. Drives the
 * foley loop and the dust throttle without re-rendering per pointer move.
 */
export function useActivityFlag(holdMs = 180): {
  active: boolean;
  poke: () => void;
} {
  const [active, setActive] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timeout.current) clearTimeout(timeout.current);
    },
    [],
  );
  const poke = useCallback(() => {
    // Setting the same value is a no-op render-wise, so pointer-move
    // floods only pay for the timer reset.
    setActive(true);
    if (timeout.current) {
      clearTimeout(timeout.current);
    }
    timeout.current = setTimeout(() => setActive(false), holdMs);
  }, [holdMs]);
  return { active, poke };
}
