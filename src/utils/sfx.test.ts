import assert from "node:assert";
import { describe, it } from "node:test";
import { variantPlaybackRate } from "./sfx";

describe("variantPlaybackRate", () => {
  it("plays clips without jitter at their recorded speed", () => {
    assert.equal(variantPlaybackRate("cash-register", 0.9), 1);
  });

  it("centers a jittered clip on its recorded speed", () => {
    assert.equal(variantPlaybackRate("footstep", 0.5), 1);
  });

  it("reaches both ends of the configured spread", () => {
    assert.equal(variantPlaybackRate("footstep", 0), 0.9);
    assert.equal(variantPlaybackRate("footstep", 1), 1.1);
  });

  it("keeps the jitter within its configured spread", () => {
    for (let i = 0; i < 200; i++) {
      const rate = variantPlaybackRate("footstep");
      assert.ok(rate >= 0.9 && rate <= 1.1, `rate ${rate}`);
    }
  });
});
