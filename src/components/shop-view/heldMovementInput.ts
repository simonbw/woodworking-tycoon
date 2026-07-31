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

/**
 * Which movement keys are physically down. Tracked whether or not movement
 * is currently allowed: a key is held across the moment a modal closes, and
 * a held key only ever sends one keydown. Dropping that keydown because the
 * listener wasn't enabled yet would leave the key stuck doing nothing until
 * it was released and pressed again.
 */
const heldCodes = new Set<string>();

/**
 * Whether held keys should actually drive the body. Mirrored from the
 * listener's prop during render, like `enabledRef` — the gate belongs here
 * rather than on recording, so that closing a modal resumes a key that was
 * already down.
 */
let movementEnabled = false;

/**
 * Whether an open panel has claimed the vertical keys for its row cursor
 * (see the panel-up/panel-down shortcuts). Horizontal movement keeps
 * working — sidestepping off the cell is still how such a card is left.
 */
let verticalCaptured = false;

/** The current input direction; diagonal when two keys are held. */
export function readHeldMovement(): Vector {
  if (!movementEnabled) {
    return [0, 0];
  }
  let x = 0;
  let y = 0;
  for (const code of heldCodes) {
    const vec = KEY_VECTORS[code];
    x += vec[0];
    y += vec[1];
  }
  return [Math.sign(x), verticalCaptured ? 0 : Math.sign(y)];
}

/** Typing in a field shouldn't drive the player around the shop. */
function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName);
}

/**
 * Listens for WASD/arrows while mounted. `enabled` gates whether the keys
 * *drive* the body, not whether they're recorded — a key released must
 * always clear, or a modal opening mid-stride would leave the player
 * marching forever, and a key still down when a modal closes must take
 * effect without being re-pressed.
 */
export const HeldMovementListener: React.FC<{
  enabled: boolean;
  /** An open panel is using W/S for its row cursor; only A/D drive the body. */
  captureVertical?: boolean;
}> = ({ enabled, captureVertical = false }) => {
  // Read at dispatch time so the listener never needs re-subscribing, and
  // so a key pressed the same frame a modal opens can't slip through.
  const enabledRef = React.useRef(enabled);
  enabledRef.current = enabled;
  movementEnabled = enabled;
  verticalCaptured = captureVertical;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.code in KEY_VECTORS)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditable(event.target)) return;
      // Record the key either way; only claim it when movement is live.
      // Disabled (modal open, player away), it falls through to whatever
      // else wants it — e.g. arrows scrolling a modal.
      if (enabledRef.current) {
        // Claim the key: arrows must not scroll the page under the shop.
        event.preventDefault();
      }
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
      movementEnabled = false;
      verticalCaptured = false;
    };
  }, []);

  return null;
};
