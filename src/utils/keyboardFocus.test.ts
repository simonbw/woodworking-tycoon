import assert from "node:assert";
import { describe, it } from "node:test";
import {
  activatesFocusedControl,
  describeKeyTarget,
  isEditable,
  KeyTargetInfo,
  keyActivatesFocusedControl,
  targetIsEditable,
} from "./keyboardFocus";

/** What the guards see when `tagName` holds focus. */
function focused(tagName: string, isContentEditable = false): KeyTargetInfo {
  return { tagName, isContentEditable };
}

/** A stand-in for a focused element, shaped as the DOM reports one. */
function element(tagName: string, isContentEditable = false): EventTarget {
  return { tagName, isContentEditable } as unknown as EventTarget;
}

describe("targetIsEditable", () => {
  it("counts text fields", () => {
    assert.equal(targetIsEditable(focused("INPUT")), true);
    assert.equal(targetIsEditable(focused("TEXTAREA")), true);
    assert.equal(targetIsEditable(focused("SELECT")), true);
  });

  it("counts a contenteditable element of any tag", () => {
    assert.equal(targetIsEditable(focused("DIV", true)), true);
  });

  it("leaves ordinary elements alone", () => {
    assert.equal(targetIsEditable(focused("BUTTON")), false);
    assert.equal(targetIsEditable(focused("BODY")), false);
  });

  it("says no when nothing is focused", () => {
    assert.equal(targetIsEditable(null), false);
  });
});

describe("keyActivatesFocusedControl", () => {
  it("gives Space to a focused button", () => {
    assert.equal(keyActivatesFocusedControl("Space", focused("BUTTON")), true);
  });

  it("gives Enter to a focused link and disclosure", () => {
    assert.equal(keyActivatesFocusedControl("Enter", focused("A")), true);
    assert.equal(keyActivatesFocusedControl("Enter", focused("SUMMARY")), true);
  });

  it("keeps Space for the shop when focus is on the page body", () => {
    assert.equal(keyActivatesFocusedControl("Space", focused("BODY")), false);
  });

  it("gives Tab to the focus ring whenever focus has left the body", () => {
    assert.equal(keyActivatesFocusedControl("Tab", focused("DIV")), true);
    assert.equal(keyActivatesFocusedControl("Tab", focused("BODY")), false);
  });

  it("leaves the floor's other keys alone", () => {
    for (const code of ["KeyE", "KeyF", "KeyZ", "KeyX", "KeyR", "Escape"]) {
      assert.equal(
        keyActivatesFocusedControl(code, focused("BUTTON")),
        false,
        code,
      );
    }
  });

  it("says no when nothing is focused", () => {
    assert.equal(keyActivatesFocusedControl("Space", null), false);
    assert.equal(keyActivatesFocusedControl("Tab", null), false);
  });
});

describe("describeKeyTarget", () => {
  it("reads an element's tag and editability", () => {
    assert.deepEqual(describeKeyTarget(element("INPUT")), {
      tagName: "INPUT",
      isContentEditable: false,
    });
  });

  it("reports nothing for a target that isn't an element", () => {
    assert.equal(describeKeyTarget(null), null);
    assert.equal(describeKeyTarget({} as EventTarget), null);
  });
});

describe("the DOM wrappers", () => {
  it("routes an event's target through the same rules", () => {
    assert.equal(isEditable(element("TEXTAREA")), true);
    assert.equal(isEditable(element("BUTTON")), false);
    assert.equal(
      activatesFocusedControl({ code: "Space", target: element("BUTTON") }),
      true,
    );
    assert.equal(
      activatesFocusedControl({ code: "Space", target: element("BODY") }),
      false,
    );
  });
});
