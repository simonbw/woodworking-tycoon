import assert from "node:assert";
import { describe, it } from "node:test";
import { migrateV13toV14 } from "./saveLoad";

describe("migrateV13toV14", () => {
  it("converts makeshift benches to small worktables, placed and stored", () => {
    const old: any = {
      machines: [
        {
          machineTypeId: "makeshiftBench",
          position: [0, 4],
          tools: ["hammer"],
        },
        { machineTypeId: "workspace", position: [1, 2], tools: [] },
      ],
      storage: { machines: ["makeshiftBench", "miterSaw"], tools: [] },
    };
    const migrated = migrateV13toV14(old);
    assert.strictEqual(migrated.machines[0].machineTypeId, "worktable1x1");
    // Everything else about the placed machine survives
    assert.deepStrictEqual(migrated.machines[0].position, [0, 4]);
    assert.deepStrictEqual(migrated.machines[0].tools, ["hammer"]);
    assert.strictEqual(migrated.machines[1].machineTypeId, "workspace");
    assert.deepStrictEqual(migrated.storage.machines, [
      "worktable1x1",
      "miterSaw",
    ]);
  });
});
