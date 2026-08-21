import assert from "node:assert";
import { existsSync } from "node:fs";
import { describe, it } from "node:test";
import {
  benchCloseUpArt,
  MAKESHIFT_BENCH_CLOSE_UP,
  worktableArtPaths,
} from "./worktable-art";

/** Where a `/images/...` art path lives in the repo. */
function shipped(path: string): boolean {
  return existsSync(new URL(`../../../static${path}`, import.meta.url));
}

describe("benchCloseUpArt", () => {
  it("gives a built table both of its close-up layers", () => {
    const art = benchCloseUpArt("worktable1x2");
    assert.deepStrictEqual(art, {
      top: "/images/workbench-2x4-top@4x.png",
      shadow: "/images/workbench-2x4-shadow@4x.png",
    });
  });

  it("gives the makeshift bench its one flattened drawing", () => {
    assert.deepStrictEqual(benchCloseUpArt("workspace"), {
      top: MAKESHIFT_BENCH_CLOSE_UP,
      shadow: null,
    });
  });

  it("has nothing for a machine that is not a bench", () => {
    assert.strictEqual(benchCloseUpArt("jobsiteTableSaw"), null);
  });

  it("names files that actually ship", () => {
    for (const id of ["worktable1x1", "worktable1x2", "workspace"]) {
      const art = benchCloseUpArt(id);
      assert.ok(art, `${id} has close-up art`);
      assert.ok(shipped(art.top), `${art.top} ships`);
      if (art.shadow) assert.ok(shipped(art.shadow), `${art.shadow} ships`);
    }
    for (const path of worktableArtPaths()) {
      assert.ok(shipped(path), `${path} ships`);
    }
  });
});
