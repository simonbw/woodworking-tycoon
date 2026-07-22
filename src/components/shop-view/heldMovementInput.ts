import React, { useEffect } from "react";
import { Vector } from "../../game/Vectors";

/**
 * Tracks which movement keys are physically held right now. Movement is
 * the one input that's about key *state* rather than key *presses*, so it
 * can't ride the ShortcutProvider (keydown-only, fires handlers once).
 * This DOM-side listener writes a module-level set that the PIXI-side
 * PlayerMotionLayer polls every frame — the same singleton pattern as
 * playerMotionStore, for the same reason.
 *
 * The shortcut registry still owns these keys' labels (`move-up` etc.) so
 * the cheat sheet and legend stay accurate.
 */

const KEY_VECTORS: Record<string, Vector> = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

const heldCodes = new Set<string>();

/** The current input direction; diagonal when two keys are held. */
export function readHeldMovement(): Vector {
  let x = 0;
  let y = 0;
  for (const code of heldCodes) {
    const vec = KEY_VECTORS[code];
    x += vec[0];
    y += vec[1];
  }
  return [Math.sign(x), Math.sign(y)];
}

/** Typing in a field shouldn't drive the player around the shop. */
function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName);
}

/**
 * Listens for WASD/arrows while mounted. `enabled` gates key-downs only —
 * a key released must always clear, or a modal opening mid-stride would
 * leave the player marching forever.
 */
export const HeldMovementListener: React.FC<{ enabled: boolean }> = ({
  enabled,
}) => {
  // Read at dispatch time so the listener never needs re-subscribing, and
  // so a key pressed the same frame a modal opens can't slip through.
  const enabledRef = React.useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    if (!enabled) {
      heldCodes.clear();
    }
  }, [enabled]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.code in KEY_VECTORS)) return;
      // When disabled (modal open, player away) the keys fall through to
      // whatever else wants them — e.g. arrows scrolling a modal.
      if (!enabledRef.current) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditable(event.target)) return;
      // Claim the key: arrows must not scroll the page under the shop.
      event.preventDefault();
      heldCodes.add(event.code);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      heldCodes.delete(event.code);
    };
    const onBlur = () => heldCodes.clear();

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      heldCodes.clear();
    };
  }, []);

  return null;
};
