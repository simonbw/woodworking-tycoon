/**
 * The single source of truth for every keyboard shortcut in the game.
 *
 * Handlers (via `useShortcut`), the on-screen hint chips, and the `?` cheat
 * sheet all read from this table, so a binding and its label can't drift apart.
 *
 * Matching is done on `KeyboardEvent.code` rather than `.key` so bindings are
 * layout-independent and unaffected by the shift key — `codes` is what fires,
 * `keys` is what the player is shown.
 */

/**
 * Which screen a shortcut is live on. `global` fires everywhere; `home` and
 * `shopLayout` only on their page. `modal` outranks everything: while any modal
 * is open only `modal` shortcuts fire, so Escape can't both close a dialog and
 * punch through to the game behind it.
 */
export type ShortcutScope = "global" | "home" | "shopLayout" | "modal";

/** Cheat-sheet section. Order here is the order rendered. */
export type ShortcutGroup =
  | "Time"
  | "Navigation"
  | "Movement"
  | "Materials"
  | "Machines"
  | "Layout Editor"
  | "General";

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  "Movement",
  "Materials",
  "Machines",
  "Time",
  "Navigation",
  "Layout Editor",
  "General",
];

export interface ShortcutDef {
  readonly id: ShortcutId;
  /** `KeyboardEvent.code` values that trigger this shortcut. */
  readonly codes: readonly string[];
  /**
   * How to display it: a list of alternatives, each a list of chips. So
   * `[["W"], ["↑"]]` renders as `W / ↑`, and `[["Shift", "E"]]` as `Shift+E`.
   */
  readonly keys: readonly (readonly string[])[];
  readonly description: string;
  readonly scope: ShortcutScope;
  readonly group: ShortcutGroup;
  /** Only fire when shift is held. Default: fires either way. */
  readonly requiresShift?: boolean;
  /** What holding shift does, when it modifies rather than gates the action. */
  readonly shiftHint?: string;
  /** Keep out of the cheat sheet (aliases already covered by another row). */
  readonly hidden?: boolean;
}

const defs = [
  // ---------------------------------------------------------------- Movement
  {
    id: "move-up",
    codes: ["KeyW", "ArrowUp"],
    keys: [["W"], ["↑"]],
    description: "Move up",
    scope: "home",
    group: "Movement",
  },
  {
    id: "move-down",
    codes: ["KeyS", "ArrowDown"],
    keys: [["S"], ["↓"]],
    description: "Move down",
    scope: "home",
    group: "Movement",
  },
  {
    id: "move-left",
    codes: ["KeyA", "ArrowLeft"],
    keys: [["A"], ["←"]],
    description: "Move left",
    scope: "home",
    group: "Movement",
  },
  {
    id: "move-right",
    codes: ["KeyD", "ArrowRight"],
    keys: [["D"], ["→"]],
    description: "Move right",
    scope: "home",
    group: "Movement",
  },
  {
    id: "cancel-last-move",
    codes: ["Backspace"],
    keys: [["Backspace"]],
    description: "Undo last queued step",
    scope: "home",
    group: "Movement",
  },
  {
    id: "clear-work-queue",
    codes: ["Escape"],
    keys: [["Esc"]],
    description: "Cancel all queued steps",
    scope: "home",
    group: "Movement",
  },

  // --------------------------------------------------------------- Materials
  {
    id: "pick-up",
    codes: ["KeyE"],
    keys: [["E"]],
    description: "Pick up from machine or floor",
    scope: "home",
    group: "Materials",
    shiftHint: "take everything",
  },
  {
    id: "put-down",
    codes: ["KeyF"],
    keys: [["F"]],
    description: "Load machine, or drop on floor",
    scope: "home",
    group: "Materials",
    shiftHint: "put down everything",
  },
  {
    // Contextual (ActionBar shows it on dusty ground once sweeping is
    // unlocked); hidden from the static cheat sheet so the broom doesn't
    // leak before its reveal.
    id: "sweep",
    codes: ["KeyT"],
    keys: [["T"]],
    description: "Sweep sawdust",
    scope: "home",
    group: "Materials",
    hidden: true,
  },

  // ---------------------------------------------------------------- Machines
  {
    id: "operate-machine",
    codes: ["KeyR"],
    keys: [["R"]],
    description: "Operate machine",
    scope: "home",
    group: "Machines",
  },
  {
    id: "cycle-operation",
    codes: ["KeyQ"],
    keys: [["Q"]],
    description: "Next machine operation",
    scope: "home",
    group: "Machines",
    shiftHint: "go backwards",
  },
  {
    id: "cycle-parameter",
    codes: ["KeyZ"],
    keys: [["Z"]],
    description: "Next operation setting",
    scope: "home",
    group: "Machines",
    shiftHint: "go backwards",
  },
  {
    id: "cycle-machine",
    codes: ["KeyX"],
    keys: [["X"]],
    description: "Target next machine on this square",
    scope: "home",
    group: "Machines",
  },

  // ------------------------------------------------------------------- Shop
  {
    id: "complete-commission",
    codes: ["KeyC"],
    keys: [["C"]],
    description: "Mark commission complete",
    scope: "home",
    group: "General",
  },
  {
    id: "scavenge",
    codes: ["KeyG"],
    keys: [["G"]],
    description: "Go scavenging for pallets",
    scope: "home",
    group: "General",
  },

  // ------------------------------------------------------------------- Time
  {
    id: "speed-pause",
    codes: ["Backquote"],
    keys: [["`"]],
    description: "Pause",
    scope: "global",
    group: "Time",
  },
  {
    id: "speed-toggle",
    codes: ["Space"],
    keys: [["Space"]],
    description: "Pause / resume",
    scope: "global",
    group: "Time",
  },
  {
    id: "speed-step",
    codes: ["Period"],
    keys: [["."]],
    description: "Step forward one tick",
    scope: "global",
    group: "Time",
  },
  {
    id: "speed-normal",
    codes: ["Digit1"],
    keys: [["1"]],
    description: "Normal speed",
    scope: "global",
    group: "Time",
  },
  {
    id: "speed-fast",
    codes: ["Digit2"],
    keys: [["2"]],
    description: "Fast speed",
    scope: "global",
    group: "Time",
  },
  {
    id: "speed-faster",
    codes: ["Digit3"],
    keys: [["3"]],
    description: "Faster speed",
    scope: "global",
    group: "Time",
  },

  // ------------------------------------------------------------- Navigation
  {
    id: "nav-home",
    codes: ["KeyH"],
    keys: [["H"]],
    description: "Home",
    scope: "global",
    group: "Navigation",
  },
  {
    id: "nav-store",
    codes: ["KeyB"],
    keys: [["B"]],
    description: "Store",
    scope: "global",
    group: "Navigation",
  },
  {
    id: "nav-layout",
    codes: ["KeyL"],
    keys: [["L"]],
    description: "Shop Layout",
    scope: "global",
    group: "Navigation",
  },
  {
    id: "nav-marketplace",
    codes: ["KeyM"],
    keys: [["M"]],
    description: "Marketplace",
    scope: "global",
    group: "Navigation",
  },
  {
    id: "nav-skills",
    codes: ["KeyK"],
    keys: [["K"]],
    description: "Skills",
    scope: "global",
    group: "Navigation",
  },

  // ----------------------------------------------------------- Layout editor
  {
    id: "layout-rotate",
    codes: ["KeyR"],
    keys: [["R"]],
    description: "Rotate",
    scope: "shopLayout",
    group: "Layout Editor",
  },
  {
    id: "layout-remove",
    codes: ["Delete", "Backspace"],
    keys: [["Del"], ["Backspace"]],
    description: "Remove to storage",
    scope: "shopLayout",
    group: "Layout Editor",
  },
  {
    id: "layout-cancel",
    codes: ["Escape"],
    keys: [["Esc"]],
    description: "Cancel placing / deselect",
    scope: "shopLayout",
    group: "Layout Editor",
  },

  // ---------------------------------------------------------------- General
  {
    id: "open-settings",
    codes: ["Comma"],
    keys: [[","]],
    description: "Settings",
    scope: "global",
    group: "General",
  },
  {
    id: "toggle-help",
    codes: ["Slash"],
    keys: [["?"]],
    description: "Show keyboard shortcuts",
    scope: "global",
    group: "General",
    requiresShift: true,
  },
  {
    id: "close-modal",
    codes: ["Escape"],
    keys: [["Esc"]],
    description: "Close",
    scope: "modal",
    group: "General",
    hidden: true,
  },
  // `toggle-help` is global, so it can't fire once the sheet claims the modal
  // scope. This is the same key, re-bound inside that scope, so `?` toggles
  // shut as advertised rather than only opening.
  {
    id: "close-help",
    codes: ["Slash"],
    keys: [["?"]],
    description: "Close",
    scope: "modal",
    group: "General",
    requiresShift: true,
    hidden: true,
  },
] as const;

export type ShortcutId = (typeof defs)[number]["id"];

export const SHORTCUTS: readonly ShortcutDef[] = defs;

const byId = new Map<string, ShortcutDef>(defs.map((d) => [d.id, d]));

export function getShortcut(id: ShortcutId): ShortcutDef {
  const def = byId.get(id);
  if (!def) throw new Error(`Unknown shortcut: ${id}`);
  return def;
}

/**
 * Every shortcut that could fire for this event, in registry order. The caller
 * narrows by scope and by which ids actually have a handler mounted.
 */
export function shortcutsForEvent(event: {
  code: string;
  shiftKey: boolean;
}): readonly ShortcutDef[] {
  return SHORTCUTS.filter(
    (def) =>
      def.codes.includes(event.code) &&
      (def.requiresShift ? event.shiftKey : true),
  );
}
