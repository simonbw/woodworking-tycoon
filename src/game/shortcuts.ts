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
 * Which screen a shortcut is live on. `global` fires everywhere; `home` only
 * on the home screen. `modal` outranks everything: while any modal is open
 * only `modal` shortcuts fire, so Escape can't both close a dialog and punch
 * through to the game behind it.
 */
export type ShortcutScope = "global" | "home" | "modal";

/** Cheat-sheet section. Order here is the order rendered. */
export type ShortcutGroup = "Movement" | "Materials" | "Machines" | "General";

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  "Movement",
  "Materials",
  "Machines",
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
  /**
   * Deliberately shares its key with another shortcut in the same scope.
   * Only sound when the two bindings' `enabled` conditions are mutually
   * exclusive (a disabled binding steps aside in ShortcutProvider); the
   * registry test skips these instead of flagging a collision.
   */
  readonly sharesKey?: boolean;
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
    // Escape backs out of one layer at a time: an open station sheet or
    // door card claims it first, and only when there's nothing to back out
    // of does it reach the pause menu. Both bindings live on the same key
    // and take turns via their `enabled` conditions — a disabled binding
    // steps aside in ShortcutProvider — so registry order is what puts the
    // sheet ahead of the menu. Same trick as carry-rotate on R.
    id: "close-sheet",
    codes: ["Escape"],
    keys: [["Esc"]],
    description: "Put the station sheet away",
    scope: "home",
    group: "Machines",
    hidden: true,
    sharesKey: true,
  },
  {
    id: "pause-menu",
    codes: ["Escape"],
    keys: [["Esc"]],
    description: "Pause — settings and save",
    scope: "home",
    group: "General",
  },

  // --------------------------------------------------------------- Materials
  {
    id: "pick-up",
    codes: ["KeyE"],
    keys: [["E"]],
    description: "Interact: take, pick up, switch on, head out",
    scope: "home",
    group: "Materials",
    shiftHint: "take everything",
  },
  {
    id: "put-down",
    codes: ["KeyF"],
    keys: [["F"]],
    description: "Give to the machine, or drop on floor",
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
  {
    // Contextual like sweep: grab the parked shop vac, or set it down.
    id: "vac-toggle",
    codes: ["KeyV"],
    keys: [["V"]],
    description: "Grab / set down the shop vac",
    scope: "home",
    group: "Materials",
    hidden: true,
  },

  // ---------------------------------------------------------------- Machines
  {
    // Contextual like sweep (ActionBar offers it standing at a machine or on
    // a crate once carrying is unlocked); hidden from the static cheat sheet
    // so the verb doesn't leak before its reveal.
    id: "carry-machine",
    codes: ["KeyB"],
    keys: [["B"]],
    description: "Pick up / put down machine",
    scope: "home",
    group: "Machines",
    hidden: true,
  },
  {
    // R is "rotate whatever is in front of you": the machine over your
    // shoulders while carrying one, the saw head otherwise. The two can't
    // both apply — you can't work a machine with one in your arms — so
    // they share the key and take turns via `enabled`, carrying first.
    id: "carry-rotate",
    codes: ["KeyR"],
    keys: [["R"]],
    description: "Rotate carried machine",
    scope: "home",
    group: "Machines",
    hidden: true,
    sharesKey: true,
    shiftHint: "the other way",
  },
  {
    id: "rotate-setting",
    codes: ["KeyR"],
    keys: [["R"]],
    description: "Swing the machine's head (the miter saw's angle)",
    scope: "home",
    group: "Machines",
    shiftHint: "the other way",
  },
  {
    // Held, not tapped: the press starts the machine and the hold is you
    // pushing the stock through it. Let go and the cut pauses where it is.
    // Power-feed machines (the planer) are the exception — the rollers do
    // the pushing, so they finish whether you're holding it or not.
    id: "operate-machine",
    codes: ["Space"],
    keys: [["Space"]],
    description: "Hold to run the machine you're at",
    scope: "home",
    group: "Machines",
  },
  {
    // Only benches, containers, and machines with a tool slot have a sheet
    // — see hasStationSheet. Everything about running a direct-feed machine
    // is a key on the floor.
    id: "open-station-sheet",
    codes: ["Tab"],
    keys: [["Tab"]],
    description: "Open the station's sheet — plans, tools, contents",
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
    // One setting, two keys, so it moves the way the thing moves: Z winds
    // the planer's head down and pulls the fence in, X the other way. On
    // the miter saw the pair slides the board itself along the cut line.
    id: "setting-down",
    codes: ["KeyZ"],
    keys: [["Z"]],
    description: "Machine setting down / in / left",
    scope: "home",
    group: "Machines",
  },
  {
    id: "setting-up",
    codes: ["KeyX"],
    keys: [["X"]],
    description: "Machine setting up / out / right",
    scope: "home",
    group: "Machines",
  },
  {
    id: "cycle-machine",
    codes: ["KeyG"],
    keys: [["G"]],
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
    // The door's destinations answer to the row numbers shown on its
    // prompt. Contextual: they only enable while the player stands at the
    // garage door with free hands, so the digits are dead keys elsewhere
    // and the cheat sheet doesn't advertise them.
    id: "door-option-1",
    codes: ["Digit1"],
    keys: [["1"]],
    description: "Head out — first destination (at the door)",
    scope: "home",
    group: "General",
    hidden: true,
  },
  {
    id: "door-option-2",
    codes: ["Digit2"],
    keys: [["2"]],
    description: "Head out — second destination (at the door)",
    scope: "home",
    group: "General",
    hidden: true,
  },
  {
    id: "door-option-3",
    codes: ["Digit3"],
    keys: [["3"]],
    description: "Head out — third destination (at the door)",
    scope: "home",
    group: "General",
    hidden: true,
  },

  // ---------------------------------------------------------------- General
  {
    id: "open-phone",
    codes: ["KeyM"],
    keys: [["M"]],
    description: "Take out your phone",
    scope: "global",
    group: "General",
  },
  {
    id: "open-journal",
    codes: ["KeyJ"],
    keys: [["J"]],
    description: "Open your journal",
    scope: "global",
    group: "General",
  },
  {
    id: "toggle-help",
    codes: ["Slash"],
    keys: [["?"]],
    description: "Open the shop manual",
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
  // Same trick for the phone and journal: their open keys re-bound inside
  // the modal scope, so M and J toggle rather than only open.
  {
    id: "close-phone",
    codes: ["KeyM"],
    keys: [["M"]],
    description: "Put the phone away",
    scope: "modal",
    group: "General",
    hidden: true,
  },
  {
    id: "close-journal",
    codes: ["KeyJ"],
    keys: [["J"]],
    description: "Close the journal",
    scope: "modal",
    group: "General",
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
