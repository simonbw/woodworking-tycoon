import {
  AudioSettings,
  getAudioSettings,
  subscribeAudioSettings,
} from "./audioSettings";
import { getAudioContext } from "./getAudioContext";

/**
 * The shared mixing graph that sits between individual sounds and the speakers:
 *
 *   per-play gain --> category bus (sfx | music) --> master gain --> destination
 *
 * Sounds connect into a category bus via {@link getSfxBus}/{@link getMusicBus}
 * instead of straight to `ctx.destination`, so the settings sliders can control
 * per-category and master volume in one place. The graph is built lazily on
 * first use (an `AudioContext` node can only exist once the context does) and
 * kept in sync with {@link audioSettings} thereafter.
 *
 * The `music` bus exists today but is unused — background music lands in #33.
 */

interface AudioBus {
  master: GainNode;
  sfx: GainNode;
  music: GainNode;
}

let bus: AudioBus | undefined;

function applyAudioSettings(settings: AudioSettings): void {
  if (!bus) return;
  const ctx = getAudioContext();
  // Short ramp instead of an instant jump so volume changes don't click.
  const ramp = (node: GainNode, value: number) =>
    node.gain.setTargetAtTime(value, ctx.currentTime, 0.015);
  ramp(bus.master, settings.muted ? 0 : settings.master);
  ramp(bus.sfx, settings.sfx);
  ramp(bus.music, settings.music);
}

function ensureBus(): AudioBus {
  if (bus) return bus;
  const ctx = getAudioContext();
  const master = ctx.createGain();
  const sfx = ctx.createGain();
  const music = ctx.createGain();
  sfx.connect(master);
  music.connect(master);
  master.connect(ctx.destination);
  bus = { master, sfx, music };

  applyAudioSettings(getAudioSettings());
  // Keep the graph in sync with future preference changes. Registered once,
  // since `ensureBus` only builds the graph a single time.
  subscribeAudioSettings(() => applyAudioSettings(getAudioSettings()));
  return bus;
}

/** The SFX category bus. Connect sound-effect sources into this node. */
export function getSfxBus(): GainNode {
  return ensureBus().sfx;
}

/** The music category bus. Connect music/ambient sources into this node (#33). */
export function getMusicBus(): GainNode {
  return ensureBus().music;
}
