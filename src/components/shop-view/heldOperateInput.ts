import React, { useEffect } from "react";
import { getShortcut } from "../../game/shortcuts";

/**
 * Tracks whether the operate key is physically held. Running a machine is
 * about key *state*, not key presses — you hold the stock against the
 * blade for as long as the cut takes — so it can't ride the
 * ShortcutProvider (keydown-only, fires handlers once). The same split as
 * heldMovementInput, for the same reason: ShortcutProvider still owns the
 * press that *starts* the operation, this owns the hold that sustains it.
 *
 * The registry owns the key itself (`operate-machine`), so rebinding it
 * moves both halves at once.
 */

const OPERATE_CODES = new Set(getShortcut("operate-machine").codes);

/** Typing in a field shouldn't run the table saw. */
function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName);
}

/**
 * Space is also how a focused button is activated, so a press aimed at one
 * must not double as a trigger pull.
 */
function activatesFocusedControl(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return ["BUTTON", "A", "SUMMARY"].includes(target.tagName);
}

/**
 * Reports whether the operate key is down. `enabled` gates key-downs only
 * — a key released must always clear, or a modal opening mid-cut would
 * leave the machine running untended forever.
 */
export const HeldOperateListener: React.FC<{
  enabled: boolean;
  onChange: (held: boolean) => void;
}> = ({ enabled, onChange }) => {
  // Read at dispatch time so the listener never needs re-subscribing, and
  // so a key pressed the same frame a modal opens can't slip through.
  const enabledRef = React.useRef(enabled);
  enabledRef.current = enabled;
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;
  const heldRef = React.useRef(false);

  const set = (held: boolean) => {
    if (heldRef.current === held) return;
    heldRef.current = held;
    onChangeRef.current(held);
  };

  useEffect(() => {
    if (!enabled) set(false);
  }, [enabled]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!OPERATE_CODES.has(event.code)) return;
      if (!enabledRef.current) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditable(event.target)) return;
      if (activatesFocusedControl(event.target)) return;
      // Claim the key: Space must not scroll the page under the shop.
      event.preventDefault();
      set(true);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (!OPERATE_CODES.has(event.code)) return;
      set(false);
    };
    const onBlur = () => set(false);

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      set(false);
    };
  }, []);

  return null;
};
