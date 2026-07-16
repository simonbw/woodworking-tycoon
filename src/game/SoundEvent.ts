import { MachineId } from "./Machine";

/**
 * A semantic, UI-agnostic sound cue emitted by pure game actions and drained by
 * the `GameSoundLayer` subscriber, which maps each cue to an actual clip.
 *
 * This is the bridge that lets tick-driven state transitions (an operation
 * finishing, and later a commission completing, a pickup, a drop) play sounds
 * without the reducers themselves touching the DOM or Web Audio. The queue is
 * transient — it is never persisted to the save (see `saveLoad.ts`).
 *
 * Only `operation-complete` is wired today; further cues land with their clips
 * in the SFX-content work (#32).
 */
export type SoundEventKind = "operation-complete";

export interface SoundEvent {
  readonly kind: SoundEventKind;
  /** The machine an operation completed on, so #32 can pick a per-machine clip. */
  readonly machineTypeId?: MachineId;
}
