import { getSfxBus } from "./audioBus";
import { getAudioContext } from "./getAudioContext";
import { getNoiseBuffer } from "./machineSynth";

/**
 * A felt tip crossing paper — the sound the to-do list makes when a box
 * gets ticked (see TutorialCard).
 *
 * Synthesized rather than sampled, for the same reason the machine voices
 * are: a tick is heard once per step and needs to land the instant the
 * state says so, and a stroke made of noise can have its speed and length
 * varied per play so the second tick isn't the first tick again.
 *
 * A stroke is bandpassed noise with a fast attack and a soft release,
 * plus a sweep: the band opens as the tip picks up speed and closes as
 * the hand lifts, which is what separates a drawn line from a hiss. A
 * check is two of them — a short stab down, a longer one up — with a
 * pause between where the hand changes direction.
 *
 * Paperwork sounds sit on the plain sfx bus, not the room bus: the note
 * is in the player's hand, not across the garage. Best-effort like every
 * other voice — any Web Audio failure just means silence.
 */

/** One pen stroke: bandpassed noise swept from `fromHz` to `toHz`. */
function stroke(
  at: number,
  duration: number,
  fromHz: number,
  toHz: number,
  level: number,
  master: GainNode,
): void {
  const ctx = getAudioContext();
  const source = ctx.createBufferSource();
  source.buffer = getNoiseBuffer(ctx);
  source.playbackRate.value = 0.8 + Math.random() * 0.4;

  // The tip's contact band: it opens as the stroke gets going and closes
  // again as the hand lifts off the paper.
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.Q.value = 1.1;
  band.frequency.setValueAtTime(fromHz, at);
  band.frequency.linearRampToValueAtTime(toHz, at + duration * 0.6);
  band.frequency.linearRampToValueAtTime(fromHz * 0.8, at + duration);

  // A little low body under the scratch: the paper and the desk it's on.
  const body = ctx.createBiquadFilter();
  body.type = "lowpass";
  body.frequency.value = 5200;

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(level, at + 0.012);
  env.gain.setValueAtTime(level, at + duration * 0.55);
  env.gain.exponentialRampToValueAtTime(0.0001, at + duration);

  source.connect(band).connect(body).connect(env).connect(master);
  source.start(at, Math.random(), duration + 0.05);
}

/**
 * The tick itself: down-stroke, direction change, up-stroke. `gain`
 * trims it against the rest of the UI set.
 */
export function playMarkerCheck(gain = 0.5): void {
  try {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => {});
    }
    const master = ctx.createGain();
    master.gain.value = gain;
    master.connect(getSfxBus());

    const now = ctx.currentTime + 0.005;
    // Speed varies a little per tick, so a run of them isn't one sound
    // played four times.
    const pace = 0.9 + Math.random() * 0.25;
    stroke(now, 0.055 * pace, 1500, 3000, 0.55, master);
    stroke(now + 0.075 * pace, 0.13 * pace, 1900, 4200, 0.75, master);

    setTimeout(() => {
      try {
        master.disconnect();
      } catch {
        // Already gone — fine.
      }
    }, 700);
  } catch {
    // Silence is the fallback.
  }
}
