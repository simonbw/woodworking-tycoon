import assert from "node:assert";
import { describe, it } from "node:test";
import {
  SHORTCUT_GROUPS,
  SHORTCUTS,
  getShortcut,
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
    // vs operate-machine on R).
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
      // a key that is global elsewhere.
      if (def.scope === "modal") continue;
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
      assert.ok(def.keys.length > 0, `${def.id} has no key caps`);
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
    const ids = shortcutsForEvent(keyEvent("KeyE")).map((d) => d.id);
    assert.deepEqual(ids, ["pick-up"]);
  });

  it("returns every binding for a shared key", () => {
    // R is Rotate while a machine is carried and Operate otherwise; the
    // provider picks between them by which handler is enabled.
    const ids = shortcutsForEvent(keyEvent("KeyR")).map((d) => d.id);
    assert.deepEqual(ids, ["carry-rotate", "operate-machine"]);
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
      ["pick-up"],
    );
  });

  it("ignores unbound keys", () => {
    assert.deepEqual(shortcutsForEvent(keyEvent("KeyU")), []);
  });
});

describe("getShortcut", () => {
  it("throws on an unknown id, rather than silently rendering nothing", () => {
    assert.throws(() => getShortcut("nope" as never), /Unknown shortcut/);
  });
});
