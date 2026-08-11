import assert from "node:assert";
import { describe, it } from "node:test";
import {
  SHORTCUT_GROUPS,
  SHORTCUTS,
  getShortcut,
  shortcutChords,
  shortcutsForButton,
  shortcutsForEvent,
} from "./shortcuts";

const keyEvent = (code: string, shiftKey = false) => ({ code, shiftKey });

describe("shortcut registry", () => {
  it("has no duplicate ids", () => {
    const ids = SHORTCUTS.map((d) => d.id);
    assert.deepEqual([...new Set(ids)], ids);
  });

  it("binds each key at most once per scope", () => {
    // Deliberately ignores `requiresShift`: shift is a modifier on several
    // actions (E/F/Q all use it to mean "do all"), so a plain and a shift-gated
    // binding on the same key in the same scope would both match one event and
    // the winner would come down to registry order. Defs marked `sharesKey`
    // opt out: their enabled conditions are mutually exclusive (carry-rotate
    // vs rotate-setting on R).
    const seen = new Set<string>();
    for (const def of SHORTCUTS) {
      if (def.sharesKey) continue;
      for (const code of def.codes) {
        const slot = `${def.scope}:${code}`;
        assert.ok(
          !seen.has(slot),
          `${code} is bound twice in the "${def.scope}" scope (${def.id})`,
        );
        seen.add(slot);
      }
    }
  });

  it("does not collide a global binding with a page binding", () => {
    const globalCodes = new Set(
      SHORTCUTS.filter((d) => d.scope === "global").flatMap((d) => d.codes),
    );
    for (const def of SHORTCUTS.filter((d) => d.scope !== "global")) {
      // `modal` is exempt: it suppresses every other scope, so it can reuse
      // a key that is global elsewhere. `sharesKey` defs shadow deliberately
      // (carry-rotate outranks rotate-setting only while carrying).
      if (def.scope === "modal" || def.sharesKey) continue;
      for (const code of def.codes) {
        assert.ok(
          !globalCodes.has(code),
          `${def.id} binds ${code}, which a global shortcut already owns`,
        );
      }
    }
  });

  it("gives every shortcut a label and a known group", () => {
    for (const def of SHORTCUTS) {
      assert.ok(
        shortcutChords(def).length > 0,
        `${def.id} has no key caps and no mouse button`,
      );
      assert.ok(def.description.length > 0, `${def.id} has no description`);
      assert.ok(
        SHORTCUT_GROUPS.includes(def.group),
        `${def.id} is in unknown group ${def.group}`,
      );
    }
  });
});

describe("shortcutsForEvent", () => {
  it("resolves a plain key", () => {
    const ids = shortcutsForEvent(keyEvent("KeyF")).map((d) => d.id);
    assert.deepEqual(ids, ["put-down"]);
  });

  it("lets an open card's cursor claim E before the interact key", () => {
    // Registry order is dispatch priority for a shared key: with a list
    // card open panel-accept is enabled and takes the highlighted row;
    // otherwise it steps aside and E interacts as usual.
    assert.deepEqual(
      shortcutsForEvent(keyEvent("KeyE")).map((d) => d.id),
      ["panel-accept", "pick-up"],
    );
  });

  it("puts the panel cursor on the movement keys", () => {
    // The move-* defs never register a handler (walking is the held-key
    // listener), so the cursor bindings are what dispatch actually finds.
    assert.deepEqual(
      shortcutsForEvent(keyEvent("KeyW")).map((d) => d.id),
      ["move-up", "panel-up"],
    );
    assert.deepEqual(
      shortcutsForEvent(keyEvent("ArrowDown")).map((d) => d.id),
      ["move-down", "panel-down"],
    );
  });

  it("returns every binding for a shared key", () => {
    // R acts on whatever is in front of you: the machine over your
    // shoulders while carrying one, the saw head at a machine with one to
    // swing, the pile underfoot otherwise. The provider picks between
    // them by which handler is enabled.
    const ids = shortcutsForEvent(keyEvent("KeyR")).map((d) => d.id);
    assert.deepEqual(ids, ["cycle-pile", "carry-rotate", "rotate-setting"]);
  });

  it("only matches shift-gated shortcuts when shift is held", () => {
    assert.deepEqual(shortcutsForEvent(keyEvent("Slash")), []);
    // Both scopes answer to `?`: global opens the sheet, modal closes it again.
    assert.deepEqual(
      shortcutsForEvent(keyEvent("Slash", true)).map((d) => d.id),
      ["toggle-help", "close-help"],
    );
  });

  it("passes shift through for shortcuts that merely modify on shift", () => {
    // Shift+E is still Pick Up — shift means "take everything", so the
    // shortcut must still resolve.
    assert.deepEqual(
      shortcutsForEvent(keyEvent("KeyE", true)).map((d) => d.id),
      ["panel-accept", "pick-up"],
    );
  });

  it("ignores unbound keys", () => {
    assert.deepEqual(shortcutsForEvent(keyEvent("KeyU")), []);
  });

  it("shares the digit row between the door's rows and the bench rail", () => {
    // Both bindings are contextual — the card only opens at the cab and
    // the rail only hangs in an open bench view — so they can never both
    // be listening, and the provider picks by which handler is enabled.
    assert.deepEqual(
      shortcutsForEvent(keyEvent("Digit1")).map((d) => d.id),
      ["door-option-1", "bench-tool-1"],
    );
  });

  it("lets an open station sheet claim Escape before the pause menu", () => {
    // Registry order is dispatch priority for a shared key: a tool held at
    // a bench goes back first, then an open sheet folds, and with nothing
    // to back out of Escape falls through to the pause menu.
    assert.deepEqual(
      shortcutsForEvent(keyEvent("Escape")).map((d) => d.id),
      ["put-back-tool", "close-sheet", "pause-menu", "close-modal"],
    );
  });
});

describe("mouse bindings", () => {
  it("routes the right button only to bindings the provider owns", () => {
    // The world-target bindings are dispatched by the sprite the cursor
    // hit. Routing them here as well would fire them on the *facing*
    // target from a press anywhere on screen — a right-click over empty
    // floor would open the sheet of whatever machine you happened to be
    // pointed at.
    assert.deepEqual(
      shortcutsForButton("right").map((d) => d.id),
      ["put-back-tool"],
    );
    for (const id of ["inspect-floor", "open-station-sheet"] as const) {
      assert.equal(getShortcut(id).worldTarget, true);
      assert.ok(getShortcut(id).buttons?.includes("right"));
    }
  });

  it("shows a mouse button as its own chip, after the keys", () => {
    assert.deepEqual(shortcutChords(getShortcut("put-back-tool")), [
      ["Esc"],
      ["Right-click"],
    ]);
  });

  it("gives a mouse-only shortcut a chip even with no keys", () => {
    // inspect-floor is dispatched by the sprite the cursor hit, so it has
    // no `codes` at all — but it still has to teach itself.
    assert.deepEqual(getShortcut("inspect-floor").codes, []);
    assert.deepEqual(shortcutChords(getShortcut("inspect-floor")), [
      ["Right-click"],
    ]);
  });
});

describe("getShortcut", () => {
  it("throws on an unknown id, rather than silently rendering nothing", () => {
    assert.throws(() => getShortcut("nope" as never), /Unknown shortcut/);
  });
});
