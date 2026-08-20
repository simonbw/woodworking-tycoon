import { MachineId } from "./Machine";

/**
 * A semantic, UI-agnostic sound cue emitted by pure game actions and drained by
 * the `GameSoundLayer` subscriber, which maps each cue to an actual clip.
 *
 * This is the bridge that lets state transitions — an operation finishing on a
 * tick, a material changing hands — play sounds without the reducers
 * themselves touching the DOM or Web Audio. The queue is transient and never
 * persisted to the save (see `sim/save/`). (Stand sales don't come through
 * here: their cha-ching belongs to the reward flight, which plays it when the
 * first coin lands — see RewardFlightLayer.)
 */
export type SoundEventKind =
  | "operation-complete"
  | "material-pickup"
  | "material-drop"
  | "nail-pry"
  | "pallet-load";

export interface SoundEvent {
  readonly kind: SoundEventKind;
  /** Which machine the operation ran on. */
  readonly machineTypeId?: MachineId;
  /**
   * Which operation finished. The clip is chosen by operation rather than by
   * machine, so tool-provided operations (sanding on a bench) sound like the
   * tool, not the bench.
   */
  readonly operationId?: string;
}
