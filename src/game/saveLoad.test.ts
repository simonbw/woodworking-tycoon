import assert from "node:assert";
import { describe, it } from "node:test";
import { migrateV13toV14, migrateV15toV16 } from "./saveLoad";
import { STARTER_SKILLS } from "./Skill";

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
    const migrated = migrateV13toV14(old) as any;
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

describe("migrateV15toV16", () => {
  it("converts stored machines to crates at the new entrance", () => {
    const old: any = {
      machines: [],
      shopInfo: { size: [4, 6] },
      progression: { unlockedSkills: STARTER_SKILLS },
      storage: { machines: ["miterSaw", "jointer"], tools: ["hammer"] },
    };
    const migrated = migrateV15toV16(old);
    assert.deepStrictEqual(migrated.shopInfo.entrancePosition, [2, 5]);
    assert.deepStrictEqual(
      migrated.machineCrates.map((crate) => crate.machine.machineTypeId),
      ["miterSaw", "jointer"],
    );
    assert.deepStrictEqual(migrated.machineCrates[0].position, [2, 5]);
    // Machine storage is gone; tool storage survives
    assert.strictEqual("machines" in migrated.storage, false);
    assert.deepStrictEqual(migrated.storage.tools, ["hammer"]);
  });
});
