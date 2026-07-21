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
 * Diegetic shop sounds — machine voices, operation one-shots, boards being
 * handled — connect to the `room` bus instead ({@link getRoomBus}), which
 * feeds the sfx bus twice: once dry and once through a ConvolverNode loaded
 * with an impulse response recorded in a real garage shop, placing every
 * sound in the same acoustic space. UI clicks and reward stingers stay on
 * the plain sfx bus: paperwork sounds don't live in the garage. Until the
 * IR loads (or if it fails), the wet path is silent and the room bus
 * behaves exactly like the sfx bus.
 *
 * The `music` bus exists today but is unused — background music lands in #33.
 */

/** Wet level of the garage convolution under the dry signal. */
const ROOM_WET_LEVEL = 0.35;

const IMPULSE_RESPONSE_URL = "/sounds/garage-impulse-response.flac";

interface AudioBus {
  master: GainNode;
  sfx: GainNode;
  music: GainNode;
  room: GainNode;
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

  // Room bus: dry straight through, wet through the garage convolver. A
  // ConvolverNode with no buffer outputs silence, so the wet path is inert
  // until (unless) the impulse response arrives.
  const room = ctx.createGain();
  room.connect(sfx);
  const convolver = ctx.createConvolver();
  const wet = ctx.createGain();
  wet.gain.value = ROOM_WET_LEVEL;
  room.connect(convolver);
  convolver.connect(wet).connect(sfx);
  void fetch(IMPULSE_RESPONSE_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`IR fetch failed (${res.status})`);
      return res.arrayBuffer();
    })
    .then((data) => ctx.decodeAudioData(data))
    .then((ir) => {
      convolver.buffer = ir;
    })
    .catch(() => {
      // No reverb is a fine fallback; the dry path is untouched.
    });

  bus = { master, sfx, music, room };

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

/**
 * The room bus: like the sfx bus, but placed in the shop's acoustic space
 * via convolution. Connect diegetic shop sounds here; keep UI feedback and
 * reward stingers on {@link getSfxBus}.
 */
export function getRoomBus(): GainNode {
  return ensureBus().room;
}
