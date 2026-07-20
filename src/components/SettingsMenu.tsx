import React, { useEffect } from "react";
import { getSfxBus } from "../utils/audioBus";
import { setAudioSettings } from "../utils/audioSettings";
import { playUiSound } from "../utils/sfx";
import { useModalScope, useShortcut } from "./shortcuts/ShortcutProvider";
import { useAudioSettings } from "./useAudioSettings";

interface SettingsMenuProps {
  onClose: () => void;
}

/**
 * Settings modal. Today it hosts the audio controls (master / SFX / music
 * volume + mute), backed by the persisted store in `utils/audioSettings`. It's
 * also the home for any future game options. Styled to the paperwork design
 * system; dismissed via backdrop click, the × button, or Escape.
 */
export const SettingsMenu: React.FC<SettingsMenuProps> = ({ onClose }) => {
  const settings = useAudioSettings();

  // Claims the modal scope, so Escape closes this and nothing else — it used
  // to also clear the player's work queue on the page behind.
  useModalScope();
  useShortcut("close-modal", onClose);

  // Build the audio graph up front (if a sound hasn't already) so dragging a
  // slider is audible immediately, not only after the first release tick.
  useEffect(() => {
    getSfxBus();
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-black/60 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="paper-card w-full max-w-sm flex flex-col gap-5"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-condensed font-bold text-2xl uppercase tracking-wide text-ink-black">
            Settings
          </h2>
          <button
            className="button-paper px-2 py-0.5 leading-none text-lg"
            onClick={onClose}
            data-sfx="ui-back"
            aria-label="Close settings"
          >
            ×
          </button>
        </div>

        <section className="flex flex-col gap-4">
          <h3 className="font-condensed font-semibold text-sm uppercase tracking-[0.15em] text-ink-fade">
            Audio
          </h3>

          <VolumeSlider
            id="settings-volume-master"
            label="Master"
            value={settings.master}
            muted={settings.muted}
            onChange={(master) => setAudioSettings({ master })}
          />
          <VolumeSlider
            id="settings-volume-sfx"
            label="Sound Effects"
            value={settings.sfx}
            muted={settings.muted}
            onChange={(sfx) => setAudioSettings({ sfx })}
          />
          <VolumeSlider
            id="settings-volume-music"
            label="Music"
            value={settings.music}
            muted={settings.muted}
            onChange={(music) => setAudioSettings({ music })}
          />

          <label className="flex flex-row items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={settings.muted}
              className="w-4 h-4 accent-gold-dark"
              onChange={(e) => {
                setAudioSettings({ muted: e.target.checked });
                // Confirm the toggle audibly (silent, of course, when muting).
                playUiSound("ui-click");
              }}
            />
            <span className="font-condensed uppercase tracking-wider text-sm text-ink-black">
              Mute all
            </span>
          </label>
        </section>
      </div>
    </div>
  );
};

interface VolumeSliderProps {
  id: string;
  label: string;
  /** 0..1 */
  value: number;
  muted: boolean;
  onChange: (value: number) => void;
}

const VolumeSlider: React.FC<VolumeSliderProps> = ({
  id,
  label,
  value,
  muted,
  onChange,
}) => {
  const percent = Math.round(value * 100);
  // A soft tick on release so the player hears the level they've landed on.
  const tick = () => playUiSound("ui-click");
  return (
    <div
      className={
        muted ? "flex flex-col gap-1 opacity-50" : "flex flex-col gap-1"
      }
    >
      <div className="flex items-baseline justify-between">
        <label
          htmlFor={id}
          className="font-condensed uppercase tracking-wider text-sm text-ink-black"
        >
          {label}
        </label>
        <span className="font-mono text-xs text-ink-fade tabular-nums">
          {percent}%
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        value={percent}
        className="w-full accent-gold-dark"
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        onPointerUp={tick}
        onKeyUp={tick}
      />
    </div>
  );
};
