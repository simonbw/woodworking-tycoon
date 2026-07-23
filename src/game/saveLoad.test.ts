import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "./board-helpers";
import {
  migrateV13toV14,
  migrateV15toV16,
  migrateV16toV17,
  migrateV17toV18,
  migrateV19toV20,
  migrateV20toV21,
  migrateV22toV23,
} from "./saveLoad";
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

describe("migrateV17toV18", () => {
  it("empties the saws' and jointer's input bays and fills in settings", () => {
    const staged = board("oak", 8, 6, 4);
    const old: any = {
      machines: [
        {
          machineTypeId: "miterSaw",
          position: [2, 4],
          rotation: 0,
          selectedOperationId: "cutBoard",
          selectedParameters: { targetLength: 5 },
          inputMaterials: [staged],
          tools: [],
        },
        {
          machineTypeId: "jointer",
          position: [1, 1],
          rotation: 0,
          selectedOperationId: "jointFace",
          selectedParameters: undefined,
          inputMaterials: [],
          tools: [],
        },
        {
          machineTypeId: "workspace",
          position: [3, 1],
          rotation: 0,
          selectedOperationId: "dismantlePallet",
          inputMaterials: [staged],
          tools: [],
        },
      ],
      machineCrates: [],
      materialPiles: [],
    };
    const migrated = migrateV17toV18(old);
    const saw = migrated.machines[0];
    // The staged board lands at the saw's operator cell
    assert.deepStrictEqual(saw.inputMaterials, []);
    assert.deepStrictEqual(migrated.materialPiles, [
      { material: staged, position: [2, 5] },
    ]);
    // Dialed settings survive, with the operation's other defaults beneath
    // (the stray targetLength rides along until v20 → v21 converts it)
    assert.deepStrictEqual(saw.selectedParameters, {
      angle: 0,
      cutPosition: 4,
      targetLength: 5,
    });
    // Benches keep their input bays — only direct-feed machines flush
    assert.deepStrictEqual(migrated.machines[2].inputMaterials, [staged]);
  });
});

describe("migrateV19toV20", () => {
  it("signs mitered ends: both-mitered boards become mirrored rails", () => {
    const unsignedRail = {
      ...board("walnut", 2, 1, 1, "sanded"),
      ends: {
        left: { kind: "mitered", angle: 45 },
        right: { kind: "mitered", angle: 45 },
      },
    };
    const oneEnd = {
      ...board("oak", 5, 1, 1, "sanded"),
      ends: {
        left: { kind: "mitered", angle: 45 },
        right: { kind: "square" },
      },
    };
    const old: any = {
      player: {
        inventory: [unsignedRail],
        away: { kind: "scavenging", returnTick: 5, loot: [] },
      },
      materialPiles: [{ material: oneEnd, position: [1, 1] }],
      machines: [
        {
          machineTypeId: "miterSaw",
          inputMaterials: [],
          processingMaterials: [],
          outputMaterials: [unsignedRail],
          storedMaterials: [],
        },
      ],
      machineCrates: [],
      listings: [{ id: "l1", material: unsignedRail, askingPrice: 5 }],
    };
    const migrated = migrateV19toV20(old);
    const mirrored = {
      left: { kind: "mitered", angle: -45 },
      right: { kind: "mitered", angle: 45 },
    };
    const endsOf = (material: unknown) => (material as any).ends;
    // Frame stock converts to the mirrored pair wherever it lives
    assert.deepStrictEqual(endsOf(migrated.player.inventory[0]), mirrored);
    assert.deepStrictEqual(
      endsOf(migrated.machines[0].outputMaterials[0]),
      mirrored,
    );
    assert.deepStrictEqual(endsOf(migrated.listings[0].material), mirrored);
    // Lone miters keep their positive magnitude untouched
    assert.deepStrictEqual(endsOf(migrated.materialPiles[0].material), {
      left: { kind: "mitered", angle: 45 },
      right: { kind: "square" },
    });
  });
});

describe("migrateV20toV21", () => {
  it("folds the saw's cut end and stop length into one cut line", () => {
    const old: any = {
      machines: [
        {
          machineTypeId: "miterSaw",
          selectedParameters: { angle: -45, cutEnd: "left", targetLength: 5 },
        },
        {
          machineTypeId: "jointer",
          selectedParameters: undefined,
        },
      ],
      machineCrates: [
        {
          position: [1, 1],
          machine: { machineTypeId: "miterSaw", selectedParameters: {} },
        },
      ],
    };
    const migrated = migrateV20toV21(old);
    // The stop length becomes where the blade lands; the end choice goes
    assert.deepStrictEqual(migrated.machines[0].selectedParameters, {
      angle: -45,
      cutPosition: 5,
    });
    // Other machines untouched
    assert.strictEqual(migrated.machines[1].selectedParameters, undefined);
    // Crated saws with nothing dialed land mid-table
    assert.deepStrictEqual(
      migrated.machineCrates[0].machine.selectedParameters,
      { cutPosition: 4 },
    );
  });
});

describe("migrateV22toV23", () => {
  it("opens the lumberyard for saves that had already earned its racks", () => {
    const old: any = {
      reputation: 12,
      player: { away: null },
      progression: { storeUnlocked: true },
    };
    const migrated = migrateV22toV23(old) as any;
    assert.strictEqual(migrated.progression.lumberyardUnlocked, true);
    // Below the S2S rack's reputation the yard stays unheard-of
    const fresh = migrateV22toV23({
      ...old,
      reputation: 11,
    }) as any;
    assert.strictEqual(fresh.progression.lumberyardUnlocked, false);
  });

  it("sends a save captured mid-trip back to Orange Box", () => {
    const old: any = {
      reputation: 0,
      player: { away: { kind: "shopping" } },
      progression: {},
    };
    const migrated = migrateV22toV23(old) as any;
    assert.deepStrictEqual(migrated.player.away, {
      kind: "shopping",
      store: "orangeBox",
    });
    // Scavenging trips pass through untouched
    const scavenging: any = {
      reputation: 0,
      player: { away: { kind: "scavenging", returnTick: 5, loot: [] } },
      progression: {},
    };
    assert.deepStrictEqual(
      (migrateV22toV23(scavenging) as any).player.away,
      scavenging.player.away,
    );
  });
});
