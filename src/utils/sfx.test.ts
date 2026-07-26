import assert from "node:assert";
import { describe, it } from "node:test";
import { clipFileNames, variantClipName, variantPlaybackRate } from "./sfx";

describe("variantClipName", () => {
  it("leaves a clip with a single file alone", () => {
    assert.equal(variantClipName("cash-register", 0.5), "cash-register");
  });

  it("picks a numbered take for a clip with several", () => {
    assert.equal(variantClipName("footstep", 0), "footstep-1");
    assert.equal(variantClipName("footstep", 0.5), "footstep-3");
  });

  it("stays in range on a roll of exactly 1", () => {
    assert.equal(variantClipName("footstep", 1), "footstep-5");
  });

  it("spreads across every take", () => {
    const picked = new Set(
      Array.from({ length: 200 }, () => variantClipName("footstep")),
    );
    assert.equal(picked.size, 5);
  });
});

describe("variantPlaybackRate", () => {
  it("plays clips without jitter at their recorded speed", () => {
    assert.equal(variantPlaybackRate("cash-register", 0.9), 1);
  });

  it("centers a jittered clip on its recorded speed", () => {
    assert.equal(variantPlaybackRate("footstep", 0.5), 1);
  });

  it("keeps the jitter within its configured spread", () => {
    for (let i = 0; i < 200; i++) {
      const rate = variantPlaybackRate("footstep");
      assert.ok(rate >= 1 - 0.06 && rate <= 1 + 0.06, `rate ${rate}`);
    }
  });
});

describe("clipFileNames", () => {
  it("lists the one file of a plain clip", () => {
    assert.deepEqual(clipFileNames("glue-clamp"), ["glue-clamp"]);
  });

  it("lists every take of a varied clip", () => {
    assert.deepEqual(clipFileNames("footstep"), [
      "footstep-1",
      "footstep-2",
      "footstep-3",
      "footstep-4",
      "footstep-5",
    ]);
  });
});
