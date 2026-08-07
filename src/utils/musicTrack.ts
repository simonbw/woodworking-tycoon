import { getMusicBus, getSfxBus } from "./audioBus";
import { getAudioContext } from "./getAudioContext";

/**
 * A single long background track that fades in and out, streamed rather
 * than decoded.
 *
 * Everything else the game plays goes through `sfx.ts`, which fetches a
 * clip and holds the decoded `AudioBuffer` forever — right for a 200ms
 * click, wrong for music: two and a half minutes decodes to tens of
 * megabytes of PCM sitting in memory for a sound the player may never
 * trigger. So a track is an `<audio>` element (the browser streams and
 * buffers it) routed into the same graph through a
 * `MediaElementAudioSourceNode`, landing on the music bus so the settings
 * menu's Music slider and the master mute apply as usual.
 *
 * The element is created on first play, so a session that never waits
 * never downloads the file.
 *
 * Like `sfx.ts` and `loopingSound.ts`, every step is best-effort: a
 * blocked autoplay, a failed fetch, or a Web Audio error silences the
 * track instead of throwing into the render tree.
 */

export interface MusicTrackDef {
  /** Absolute URL under `/sounds/`. */
  readonly url: string;
  /** Overall trim for this track, applied under its bus. */
  readonly gain: number;
  /**
   * Which slider owns it. Music by default; a long ambience that is a
   * *sound* rather than a score — the truck's engine on the scavenging
   * circuit — rides the sfx bus, because someone who turns the music off
   * still expects to hear the truck.
   */
  readonly bus?: "music" | "sfx";
  /** Fade length coming in. Long: music should arrive, not cut in. */
  readonly fadeInMs: number;
  /** Fade length going out. */
  readonly fadeOutMs: number;
}

/**
 * The wait verb's soundtrack: elevator music, because holding the wait key
 * is being put on hold (see `HoldMusicLayer`). The gain sits low under the
 * music bus — this plays *while the player is doing nothing*, so it has to
 * be pleasant at length rather than present.
 */
export const HOLD_MUSIC: MusicTrackDef = {
  url: "/sounds/hold-music.ogg",
  gain: 0.5,
  // Slow in, quicker out: the music should sneak up on a long wait, but
  // let go promptly the moment the player picks the work back up.
  fadeInMs: 2500,
  fadeOutMs: 1200,
};

/**
 * The truck out on the scavenging circuit: engine and road noise under
 * the searching leg, the only thing that says the half-hour between
 * stops is being driven rather than waited out. Streamed like the hold
 * music (it is minutes long) but on the sfx bus, and faded in so the
 * engine arrives with the road rather than snapping on.
 */
export const TRUCK_DRIVING_LOOP: MusicTrackDef = {
  url: "/sounds/truck-driving-loop.mp3",
  gain: 0.45,
  bus: "sfx",
  fadeInMs: 1400,
  fadeOutMs: 900,
};

export class MusicTrack {
  private readonly def: MusicTrackDef;
  private element: HTMLAudioElement | null = null;
  private gain: GainNode | null = null;
  private playing = false;
  private failed = false;
  private disposed = false;
  /** Pauses the element once a fade-out has finished sounding. */
  private stopTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(def: MusicTrackDef) {
    this.def = def;
  }

  /**
   * Start or stop the track. Idempotent, so callers can drive this from a
   * render pass with whatever the game state currently implies.
   *
   * Stopping fades out and then pauses the element *without* rewinding, so
   * starting again picks the track up where it left off — several short
   * waits sound like one piece of music heard in installments, not like
   * the same eight bars over and over.
   */
  setPlaying(playing: boolean): void {
    if (this.disposed || this.failed || playing === this.playing) return;
    this.playing = playing;
    try {
      if (playing) {
        this.fadeIn();
      } else {
        this.fadeOut();
      }
    } catch {
      this.failed = true;
    }
  }

  /** Stop immediately and release the element. The track is dead after this. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.playing = false;
    clearTimeout(this.stopTimer);
    try {
      this.element?.pause();
      this.gain?.disconnect();
    } catch {
      // Best-effort teardown.
    }
    this.element = null;
    this.gain = null;
  }

  private ensureElement(): HTMLAudioElement {
    if (this.element) return this.element;
    const ctx = getAudioContext();
    const element = new Audio(this.def.url);
    element.loop = true;
    element.preload = "auto";
    const gain = ctx.createGain();
    gain.gain.value = 0;
    ctx.createMediaElementSource(element).connect(gain);
    gain.connect(this.def.bus === "sfx" ? getSfxBus() : getMusicBus());
    this.element = element;
    this.gain = gain;
    return element;
  }

  private fadeIn(): void {
    clearTimeout(this.stopTimer);
    const element = this.ensureElement();
    const ctx = getAudioContext();
    // The context is suspended until the first user gesture; resuming is
    // idempotent, and the element's own play() carries the same gesture
    // requirement, so both are best-effort.
    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => {});
    }
    void element.play().catch(() => {});
    this.ramp(this.def.gain, this.def.fadeInMs);
  }

  private fadeOut(): void {
    if (!this.element) return;
    const element = this.element;
    this.ramp(0, this.def.fadeOutMs);
    // Let the fade finish sounding before the element stops feeding it.
    this.stopTimer = setTimeout(() => {
      if (!this.playing) element.pause();
    }, this.def.fadeOutMs);
  }

  /** Linear ramp from wherever the fade currently stands, so reversals are smooth. */
  private ramp(target: number, durationMs: number): void {
    const gain = this.gain;
    if (!gain) return;
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const current = gain.gain.value;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(current, now);
    gain.gain.linearRampToValueAtTime(target, now + durationMs / 1000);
  }
}
