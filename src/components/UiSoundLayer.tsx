import { useEffect } from "react";
import { playUiSound, preloadUiSounds, UiSoundName } from "../utils/sfx";

/**
 * Mounts once at the app root and gives every DOM `<button>` a UI sound:
 * a soft tick on hover and a two-part click on press — `ui-click-start` when
 * the pointer goes down and `ui-click-end` on release. Buttons that want a
 * different press sound declare `data-sfx="ui-purchase"` (etc.); those keep
 * their single sound on click (no down/up split), and `data-sfx="none"` opts a
 * button out of the click sound entirely. Hover is uniform.
 * `<select>` changes (operation mode, target length/width/…) get a tick too,
 * since they're the one common control that isn't a button.
 *
 * Centralising it here means new buttons get sound for free, with no
 * per-component wiring.
 */
export const UiSoundLayer: React.FC = () => {
  useEffect(() => {
    preloadUiSounds();

    // Track the currently-hovered button so moving the pointer across a
    // button's child elements doesn't re-trigger the hover tick.
    let hovered: Element | null = null;

    const onPointerOver = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      const button = target?.closest("button:not([disabled])") ?? null;
      if (button === hovered) return;
      hovered = button;
      if (button) playUiSound("ui-hover");
    };

    // First half of the default press. Buttons with a custom `data-sfx` keep
    // their single sound on click, so they don't get a down tick here.
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      const button = target?.closest("button:not([disabled])");
      if (!button) return;
      if ((button as HTMLElement).dataset.sfx) return;
      playUiSound("ui-click-start");
    };

    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const button = target?.closest("button:not([disabled])");
      if (!button) return;
      const override = (button as HTMLElement).dataset.sfx;
      if (override === "none") return;
      playUiSound((override as UiSoundName) ?? "ui-click-end");
    };

    const onChange = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (target?.tagName === "SELECT") playUiSound("ui-click");
    };

    document.addEventListener("pointerover", onPointerOver);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("click", onClick);
    document.addEventListener("change", onChange);
    return () => {
      document.removeEventListener("pointerover", onPointerOver);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("click", onClick);
      document.removeEventListener("change", onChange);
    };
  }, []);

  return null;
};
