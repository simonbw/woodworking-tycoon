import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ShortcutId,
  ShortcutScope,
  shortcutsForEvent,
} from "../../game/shortcuts";
import { useUiMode } from "../UiMode";

type Handler = (event: KeyboardEvent) => void;

interface Registration {
  handler: Handler;
  /** Checked at dispatch time, not registration time — see `useShortcut`. */
  isEnabled: () => boolean;
}

interface ShortcutContextValue {
  register: (id: ShortcutId, registration: Registration) => () => void;
  pushModal: () => () => void;
}

const shortcutContext = createContext<ShortcutContextValue | undefined>(
  undefined,
);

/** Which non-global scope is live, given the screen the player is on. */
function scopeForMode(mode: string): ShortcutScope | null {
  switch (mode) {
    case "normal":
      return "home";
    case "shopLayout":
      return "shopLayout";
    default:
      return null;
  }
}

/** Typing in a field shouldn't drive the player around the shop. */
function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName);
}

/**
 * Space and Enter belong to whatever control has focus — stealing them would
 * break keyboard activation for every button in the game (Space is bound to
 * pause/resume, so this is a live conflict, not a hypothetical one).
 */
function activatesFocusedControl(event: KeyboardEvent): boolean {
  if (event.code !== "Space" && event.code !== "Enter") return false;
  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;
  return ["BUTTON", "A", "SUMMARY"].includes(target.tagName);
}

/**
 * Owns the game's single keydown listener and routes each event to at most one
 * handler, chosen by scope. Before this existed every `useKeyDown` caller got
 * every keystroke, which let Escape close the settings modal *and* clear the
 * work queue behind it, and let the volume slider's arrow keys walk the player
 * around. Handlers register by id; the key they answer to lives in the
 * registry (`src/game/shortcuts.ts`), not here.
 */
export const ShortcutProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { mode } = useUiMode();
  // A stack per id, not a single entry: two modals can be open at once (the
  // cheat sheet plus Settings), and both bind `close-modal`. The innermost
  // registration wins, and unmounting one must not evict the other's.
  const handlers = useRef(new Map<ShortcutId, Registration[]>());
  const [modalDepth, setModalDepth] = useState(0);

  // Read through refs so the listener never needs re-subscribing.
  const modeRef = useRef(mode.mode);
  modeRef.current = mode.mode;
  const modalDepthRef = useRef(modalDepth);
  modalDepthRef.current = modalDepth;

  const register = useCallback((id: ShortcutId, registration: Registration) => {
    const stack = handlers.current.get(id) ?? [];
    stack.push(registration);
    handlers.current.set(id, stack);
    return () => {
      const current = handlers.current.get(id);
      if (!current) return;
      const index = current.indexOf(registration);
      if (index !== -1) current.splice(index, 1);
      if (current.length === 0) handlers.current.delete(id);
    };
  }, []);

  const pushModal = useCallback(() => {
    setModalDepth((d) => d + 1);
    return () => setModalDepth((d) => Math.max(0, d - 1));
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Let the browser's own editing shortcuts through untouched.
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      // Escape still has to work from inside a field, so you can back out of
      // whatever put you there.
      if (isEditable(event.target) && event.code !== "Escape") return;
      if (activatesFocusedControl(event)) return;

      const allowed: readonly ShortcutScope[] =
        modalDepthRef.current > 0
          ? ["modal"]
          : (["global", scopeForMode(modeRef.current)].filter(
              Boolean,
            ) as ShortcutScope[]);

      for (const def of shortcutsForEvent(event)) {
        if (!allowed.includes(def.scope)) continue;
        // Innermost registration first. A disabled binding steps aside rather
        // than swallowing the key, so another scope can still answer for it.
        const stack = handlers.current.get(def.id) ?? [];
        const registration = [...stack]
          .reverse()
          .find((candidate) => candidate.isEnabled());
        if (!registration) continue;
        event.preventDefault();
        registration.handler(event);
        return;
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const value = useMemo(() => ({ register, pushModal }), [register, pushModal]);

  return (
    <shortcutContext.Provider value={value}>
      {children}
    </shortcutContext.Provider>
  );
};

function useShortcutContext(): ShortcutContextValue {
  const value = useContext(shortcutContext);
  if (!value) {
    throw new Error("useShortcut must be used inside a ShortcutProvider");
  }
  return value;
}

/**
 * Bind a handler to a shortcut. It only fires when the shortcut's scope is
 * live and `enabled` is true — pass `enabled` for state-dependent bindings
 * (e.g. don't operate machines while the player is away scavenging).
 */
export function useShortcut(
  id: ShortcutId,
  handler: Handler,
  enabled: boolean = true,
): void {
  const { register } = useShortcutContext();

  // Both are read through refs at dispatch time. Registering/unregistering on
  // `enabled` instead would leave a gap: passive effects flush after the DOM
  // commit, so a key pressed in that window would still reach a handler the UI
  // has already stopped offering.
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(
    () =>
      register(id, {
        handler: (event) => handlerRef.current(event),
        isEnabled: () => enabledRef.current,
      }),
    [id, register],
  );
}

/**
 * Mark a modal as open for as long as the calling component is mounted. While
 * any modal is open, only `modal`-scoped shortcuts fire.
 */
export function useModalScope(): void {
  const { pushModal } = useShortcutContext();
  useEffect(() => pushModal(), [pushModal]);
}
