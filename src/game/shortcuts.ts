/**
 * The single source of truth for every shortcut in the game.
 *
 * Handlers (via `useShortcut`), the on-screen hint chips, and the `?` cheat
 * sheet all read from this table, so a binding and its label can't drift apart.
 *
 * Matching is done on `KeyboardEvent.code` rather than `.key` so bindings are
 * layout-independent and unaffected by the shift key — `codes` is what fires,
 * `keys` is what the player is shown.
 *
 * A shortcut can also answer to a mouse button (`buttons`). Those dispatch
 * through the same provider and get their own chip in the `?` cheat sheet —
 * but not in the floating hint clusters, which stay the keyboard's: a
 * spelled-out "Right-click" cap is wider than the machine it hovers over.
 * Bindings that need to know *what*
 * the cursor is over — right-clicking a machine, a piece on the floor — are
 * dispatched by the sprite that was hit rather than here; their entry in this
 * table carries no `codes` and exists so the verb still gets a chip and a row
 * in the cheat sheet.
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

/**
 * A mouse button a shortcut answers to. Only the right button so far: the
 * left one belongs to the thing under it (aiming the keyboard at a machine,
 * pulling a blueprint off the pile), which is object-scoped rather than a
 * shortcut.
 */
export type MouseButton = "right";

/** What each button is called on its chip. */
export const MOUSE_BUTTON_LABELS: Record<MouseButton, string> = {
  right: "Right-click",
};

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
  /**
   * Mouse buttons that also trigger it, shown as their own chip after the
   * keys. A shortcut may have buttons and no `codes` at all.
   */
  readonly buttons?: readonly MouseButton[];
  /**
   * This binding acts on whatever the cursor is over, so the sprite that
   * was hit dispatches it and the provider must not: a press anywhere else
   * on screen isn't the same gesture, and routing it centrally would fire
   * the verb on the *facing* target from across the room.
   */
  readonly worldTarget?: boolean;
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
    // The innermost thing Escape backs out of: a tool (or a clamp, or the
    // glue) picked up in the bench view goes back where it came from
    // before the sheet holding it would fold. The right button does the
    // same thing without reaching for the keyboard — the one mouse verb
    // at a bench, where the pointer is already the hand.
    id: "put-back-tool",
    codes: ["Escape"],
    keys: [["Esc"]],
    buttons: ["right"],
    description: "Put back the tool in your hand",
    scope: "home",
    group: "Machines",
    sharesKey: true,
  },
  {
    // Escape backs out of one layer at a time: a held tool first, then an
    // open station sheet or door card, and only when there's nothing to back
    // out of does it reach the pause menu. The bindings live on the same key
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

  // ------------------------------------------------------------ Panel cursor
  // An open list card (the truck's trip card) puts a cursor on its rows:
  // W/S walk the cursor instead of the body, and E takes the row it's on.
  // All three share their keys with the floor's own bindings and only
  // enable while such a card is open — registry order is what lets E reach
  // the card before the interact key answers for it.
  {
    id: "panel-up",
    codes: ["KeyW", "ArrowUp"],
    keys: [["W"], ["↑"]],
    description: "Up the open card's rows",
    scope: "home",
    group: "General",
    hidden: true,
    sharesKey: true,
  },
  {
    id: "panel-down",
    codes: ["KeyS", "ArrowDown"],
    keys: [["S"], ["↓"]],
    description: "Down the open card's rows",
    scope: "home",
    group: "General",
    hidden: true,
    sharesKey: true,
  },
  {
    id: "panel-accept",
    codes: ["KeyE"],
    keys: [["E"]],
    description: "Take the highlighted row",
    scope: "home",
    group: "General",
    hidden: true,
    sharesKey: true,
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
    // Rummage: with more than one piece within reach, R steps the
    // targeting outline through the pile to pick out a specific one.
    // Shares R with the rotate pair — a targeted machine with a head to
    // swing keeps the key (dialing the saw outranks the offcuts at its
    // feet), so this binding only enables when no live rotate setting
    // claims it.
    id: "cycle-pile",
    codes: ["KeyR"],
    keys: [["R"]],
    description:
      "Target the next piece within reach — the floor's pieces and a loaded bench's stock",
    scope: "home",
    group: "Materials",
    sharesKey: true,
    shiftHint: "go backwards",
  },
  {
    // What's in a stack is otherwise invisible — R steps the outline
    // through it a piece at a time. Right-clicking a piece lays the whole
    // armful out on a card instead, and any of it can be taken from there.
    // Dispatched by the sprite that was hit (see ShopView), so no `codes`.
    id: "inspect-floor",
    codes: [],
    keys: [],
    buttons: ["right"],
    worldTarget: true,
    description: "Look through the pieces within reach",
    scope: "home",
    group: "Materials",
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
    // Contextual like sweep (ActionBar offers it standing at a machine or
    // on a crate); hidden from the static cheat sheet — the chip at the
    // machine teaches it in place.
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
    description:
      "Swing the machine's head (the miter saw's angle), or turn the stock between flat and on edge (the saws that both rip and resaw)",
    scope: "home",
    group: "Machines",
    shiftHint: "the other way",
  },
  {
    // Held, not tapped — the same shape as running a machine, aimed at
    // the clock instead: hold it and time passes fast, release and it
    // stops. Needs no target and works anywhere in the shop; the easy
    // answer to a glue cure, against which filling the wait with other
    // work is the skilled play (see time-flow.ts). Stands down at
    // night, when there's nothing left to spend.
    id: "wait",
    codes: ["KeyT"],
    keys: [["T"]],
    description: "Hold to let time pass",
    scope: "home",
    group: "General",
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
    // Right-clicking a machine you're standing at opens the same sheet,
    // aimed at the one under the cursor rather than the one you're facing.
    // Dispatched by the sprite that was hit (see ShopView), not by the
    // provider — the hit test is the whole point.
    buttons: ["right"],
    worldTarget: true,
    description: "Open the station's sheet — plans, tools, contents",
    scope: "home",
    group: "Machines",
  },
  {
    // The bench view's key: it thumbs the blueprint pile in the corner,
    // and only answers with the drawing in front of you. Out on the floor
    // a bench is a table, not a machine with a mode dial.
    id: "cycle-operation",
    codes: ["KeyQ"],
    keys: [["Q"]],
    description: "Next plan on the bench",
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
    // On a fine scale — the miter saw's inch marks — shift moves a foot
    // at a time. Scales without a coarse step just move one mark.
    shiftHint: "move a foot at a time",
  },
  {
    id: "setting-up",
    codes: ["KeyX"],
    keys: [["X"]],
    description: "Machine setting up / out / right",
    scope: "home",
    group: "Machines",
    shiftHint: "move a foot at a time",
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
    // The door's rows answer to the numbers shown on its card: places to
    // go first (so Orange Box is always 1, whatever you're carrying), then
    // any work you're holding that someone is waiting on. Contextual: they
    // only enable while the player stands at the cab with the card
    // open, so the digits are dead keys elsewhere and the cheat sheet
    // doesn't advertise them individually.
    id: "door-option-1",
    codes: ["Digit1"],
    keys: [["1"]],
    description: "The truck — first row",
    scope: "home",
    group: "General",
    hidden: true,
  },
  {
    id: "door-option-2",
    codes: ["Digit2"],
    keys: [["2"]],
    description: "The truck — second row",
    scope: "home",
    group: "General",
    hidden: true,
  },
  {
    id: "door-option-3",
    codes: ["Digit3"],
    keys: [["3"]],
    description: "The truck — third row",
    scope: "home",
    group: "General",
    hidden: true,
  },
  {
    id: "door-option-4",
    codes: ["Digit4"],
    keys: [["4"]],
    description: "The truck — fourth row",
    scope: "home",
    group: "General",
    hidden: true,
  },
  {
    id: "door-option-5",
    codes: ["Digit5"],
    keys: [["5"]],
    description: "The truck — fifth row",
    scope: "home",
    group: "General",
    hidden: true,
  },
  {
    id: "door-option-6",
    codes: ["Digit6"],
    keys: [["6"]],
    description: "The truck — sixth row",
    scope: "home",
    group: "General",
    hidden: true,
  },
  {
    id: "door-option-7",
    codes: ["Digit7"],
    keys: [["7"]],
    description: "The truck — seventh row",
    scope: "home",
    group: "General",
    hidden: true,
  },
  {
    id: "door-option-8",
    codes: ["Digit8"],
    keys: [["8"]],
    description: "The truck — eighth row",
    scope: "home",
    group: "General",
    hidden: true,
  },
  {
    id: "door-option-9",
    codes: ["Digit9"],
    keys: [["9"]],
    description: "The truck — ninth row",
    scope: "home",
    group: "General",
    hidden: true,
  },

  // ---------------------------------------------------------------- General
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
  // Same trick for the journal: its open key re-bound inside the modal
  // scope, so J toggles rather than only opens.
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

/**
 * Every shortcut a mouse button could fire, in registry order — the button's
 * half of `shortcutsForEvent`. Narrowed by the caller the same way.
 */
export function shortcutsForButton(
  button: MouseButton,
): readonly ShortcutDef[] {
  return SHORTCUTS.filter(
    (def) => def.buttons?.includes(button) && !def.worldTarget,
  );
}

/**
 * Everything a shortcut is shown as: its key alternatives, then a chip per
 * mouse button — `Tab` on its own, `Esc / Right-click` where both work. The
 * full reference (the `?` sheet) shows these; the in-world hint chips show
 * `keys` alone (see ShortcutKeys).
 */
export function shortcutChords(
  def: ShortcutDef,
): readonly (readonly string[])[] {
  const buttons = (def.buttons ?? []).map((button) => [
    MOUSE_BUTTON_LABELS[button],
  ]);
  return [...def.keys, ...buttons];
}
