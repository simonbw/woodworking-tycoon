/**
 * Who owns a keystroke: the page, or the shop?
 *
 * Two dispatchers read the same keydown — the engine's
 * ShortcutDispatcher for the floor and the DOM's ShortcutProvider for
 * the chrome — so the "is the browser already using this key?" question
 * has to be answered the same way in both. It lives here so it's asked
 * once and answered once.
 *
 * The predicates come in two halves: pure ones over a small description
 * of the focused element (unit-testable without a DOM) and thin DOM
 * wrappers the listeners actually call.
 */

/** What the guards need to know about the element a key landed on. */
export interface KeyTargetInfo {
  /** Uppercase tag name, as the DOM reports it. */
  tagName: string;
  isContentEditable: boolean;
}

/** Tags that take typed text. */
const EDITABLE_TAGS = new Set(["INPUT", "SELECT", "TEXTAREA"]);

/** Tags Space and Enter activate when they hold focus. */
const ACTIVATABLE_TAGS = new Set(["BUTTON", "A", "SUMMARY"]);

/** Typing in a field shouldn't run the table saw. */
export function targetIsEditable(target: KeyTargetInfo | null): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  return EDITABLE_TAGS.has(target.tagName);
}

/**
 * Keys the browser's own focus handling has first claim on whenever
 * something is focused. Stealing them would break keyboard navigation
 * outright: Space and Enter activate the focused control (Space runs the
 * machine you're at, so that's a live conflict, not a hypothetical one),
 * and Tab is how you reach a control in the first place — with focus
 * anywhere but the page body it must keep moving the focus ring rather
 * than opening a station sheet.
 */
export function keyActivatesFocusedControl(
  code: string,
  target: KeyTargetInfo | null,
): boolean {
  if (!target) return false;
  if (code === "Tab") return target.tagName !== "BODY";
  if (code !== "Space" && code !== "Enter") return false;
  return ACTIVATABLE_TAGS.has(target.tagName);
}

/**
 * Describe an event's target, or null when it isn't an element (the
 * window and the document both arrive here).
 */
export function describeKeyTarget(
  target: EventTarget | null,
): KeyTargetInfo | null {
  const element = target as {
    tagName?: unknown;
    isContentEditable?: unknown;
  } | null;
  if (!element || typeof element.tagName !== "string") return null;
  return {
    tagName: element.tagName,
    isContentEditable: element.isContentEditable === true,
  };
}

/** Typing in a field shouldn't drive the player around the shop. */
export function isEditable(target: EventTarget | null): boolean {
  return targetIsEditable(describeKeyTarget(target));
}

/** Whether this press is the browser's, because a control holds focus. */
export function activatesFocusedControl(event: {
  code: string;
  target: EventTarget | null;
}): boolean {
  return keyActivatesFocusedControl(
    event.code,
    describeKeyTarget(event.target),
  );
}
