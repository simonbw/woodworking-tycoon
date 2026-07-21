import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "./board-helpers";
import { migrateV13toV14, migrateV15toV16, migrateV16toV17 } from "./saveLoad";
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

describe("migrateV16toV17", () => {
  it("merges the planer's recipes into `plane` and empties its input bay", () => {
    const staged = board("walnut", 8, 6, 4);
    const old: any = {
      machines: [
        {
          machineTypeId: "lunchboxPlaner",
          position: [1, 1],
          rotation: 0,
          selectedOperationId: "planePanel",
          selectedParameters: { targetThickness: 3 },
          inputMaterials: [staged],
        },
        {
          machineTypeId: "jointer",
          position: [3, 1],
          rotation: 0,
          selectedOperationId: "jointFace",
          inputMaterials: [],
        },
      ],
      machineCrates: [
        {
          machine: {
            machineTypeId: "lunchboxPlaner",
            position: [0, 0],
            rotation: 0,
            selectedOperationId: "planeBoard",
            selectedParameters: undefined,
            inputMaterials: [],
          },
          position: [2, 5],
        },
      ],
      materialPiles: [],
    };
    const migrated = migrateV16toV17(old);
    const planer = migrated.machines[0];
    assert.strictEqual(planer.selectedOperationId, "plane");
    // The crank position carries over
    assert.deepStrictEqual(planer.selectedParameters, { targetThickness: 3 });
    // Staged stock lands as a pile at the infeed cell
    assert.deepStrictEqual(planer.inputMaterials, []);
    assert.deepStrictEqual(migrated.materialPiles, [
      { material: staged, position: [1, 2] },
    ]);
    // Other machines untouched
    assert.strictEqual(migrated.machines[1].selectedOperationId, "jointFace");
    // Crated planers migrate too, and never-dialed cranks get a position
    const crated = migrated.machineCrates[0].machine;
    assert.strictEqual(crated.selectedOperationId, "plane");
    assert.deepStrictEqual(crated.selectedParameters, { targetThickness: 1 });
  });
});
