import { useSyncExternalStore } from "react";
import {
  AudioSettings,
  getAudioSettings,
  subscribeAudioSettings,
} from "../utils/audioSettings";

/**
 * Subscribe a component to the persisted audio preferences. Re-renders whenever
 * the settings change (from this component or anywhere else). Pair with
 * `setAudioSettings` from `utils/audioSettings` to write.
 */
export function useAudioSettings(): AudioSettings {
  return useSyncExternalStore(
    subscribeAudioSettings,
    getAudioSettings,
    getAudioSettings,
  );
}
