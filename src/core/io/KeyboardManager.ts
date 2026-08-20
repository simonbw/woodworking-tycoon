import { IoEventDispatch } from "../entity/IoEvents";
import { KeyCode } from "./Keys";

/**
 * Manages keyboard input state and events.
 * Tracks which keys are currently pressed and dispatches events to handlers.
 */
export class KeyboardManager {
  private keys: Map<KeyCode, boolean> = new Map();
  private boundOnKeyDown: (e: KeyboardEvent) => void;
  private boundOnKeyUp: (e: KeyboardEvent) => void;
  private boundOnVisibilityChange: () => void;
  private boundOnBlur: () => void;

  constructor(
    private dispatch: IoEventDispatch,
    private onInputActivity: () => void,
  ) {
    this.boundOnKeyDown = (e) => this.onKeyDown(e);
    this.boundOnKeyUp = (e) => this.onKeyUp(e);
    this.boundOnVisibilityChange = () => this.clearAllKeys();
    this.boundOnBlur = () => this.clearAllKeys();

    document.addEventListener("keydown", this.boundOnKeyDown);
    document.addEventListener("keyup", this.boundOnKeyUp);
    document.addEventListener("visibilitychange", this.boundOnVisibilityChange);
    // Clicking another window — a second monitor, the devtools pane —
    // hides the release: the keyup lands over there. Without this a held
    // W walks the player into the wall forever, and a held Space keeps
    // feeding the saw.
    window.addEventListener("blur", this.boundOnBlur);
  }

  /**
   * Returns true if the given key is currently pressed down.
   */
  isKeyDown(key: KeyCode): boolean {
    return Boolean(this.keys.get(key));
  }

  /**
   * Releases every key that's still down and dispatches its keyUp, so
   * everything downstream — held movement, the operate flag, the wait
   * key — sees the release it would otherwise never get. Called when the
   * page is hidden or the window loses focus.
   */
  private clearAllKeys(): void {
    for (const [keyCode, down] of this.keys) {
      if (!down) continue;
      this.keys.set(keyCode, false);
      this.dispatch("keyUp", { key: keyCode });
    }
  }

  /**
   * Determines whether to prevent the default browser action for a key press.
   *
   * Trimmed from the vendored engine (which swallowed Tab and "s"
   * outright): the DOM layer owns Tab's focus handling — modal-aware,
   * via BrowserDefaultsGuard — and plain "s" has no browser default,
   * only Ctrl/Cmd+S does. Here only the chrome shortcuts that would
   * yank the page out from under the game are stopped.
   */
  private shouldPreventDefault(event: KeyboardEvent): boolean {
    // Browser zoom and save shortcuts (Cmd/Ctrl + Plus/Minus/S)
    if (
      (event.metaKey || event.ctrlKey) &&
      (event.key === "=" ||
        event.key === "-" ||
        event.key.toLowerCase() === "s")
    ) {
      return true;
    }
    return false;
  }

  private onKeyDown(event: KeyboardEvent): void {
    this.onInputActivity();
    const code = event.code as KeyCode;
    const wasPressed = this.keys.get(code); // for filtering out auto-repeat stuff
    this.keys.set(code, true);
    if (!wasPressed) {
      this.dispatch("keyDown", { key: code, event });
    }
    if (this.shouldPreventDefault(event)) {
      event.preventDefault();
    }
  }

  private onKeyUp(event: KeyboardEvent): void {
    const code = event.code as KeyCode;
    this.keys.set(code, false);
    this.dispatch("keyUp", { key: code, event });
    if (this.shouldPreventDefault(event)) {
      event.preventDefault();
    }
  }

  destroy(): void {
    document.removeEventListener("keydown", this.boundOnKeyDown);
    document.removeEventListener("keyup", this.boundOnKeyUp);
    document.removeEventListener(
      "visibilitychange",
      this.boundOnVisibilityChange,
    );
    window.removeEventListener("blur", this.boundOnBlur);
  }
}
