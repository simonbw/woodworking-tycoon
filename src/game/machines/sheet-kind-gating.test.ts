import assert from "node:assert";
import { describe, it } from "node:test";
import { MACHINE_TYPES, MachineOperation } from "../Machine";
import { makeMaterial, materialMeetsInput } from "../material-helpers";
import { SHEET_GOOD_KINDS, SheetGood, SheetGoodKind } from "../Materials";
import {
  JIG_GRADE_KINDS,
  RACK_GRADE_KINDS,
  SHOP_FURNITURE_KINDS,
} from "./benchOperations";
import { workspace } from "./workspace";

function sheet(kind: SheetGoodKind): SheetGood {
  return makeMaterial<SheetGood>({
    type: "plywood",
    kind,
    length: 4,
    width: 4,
    thickness: 2,
  });
}

function sheetRequirementOf(operationId: string) {
  const operation = workspace.operations.find(
    (op) => op.id === operationId,
  ) as MachineOperation;
  assert.ok(operation, `${operationId} should exist on the bench`);
  const requirement = operation.inputMaterials.find((req) =>
    (req.type as ReadonlyArray<string> | undefined)?.includes("plywood"),
  );
  assert.ok(requirement, `${operationId} should take a sheet`);
  return requirement;
}

function acceptedKinds(operationId: string): ReadonlyArray<SheetGoodKind> {
  const requirement = sheetRequirementOf(operationId);
  return SHEET_GOOD_KINDS.filter((kind) =>
    materialMeetsInput(sheet(kind), requirement),
  );
}

describe("sheet kind gating", () => {
  it("sled bases take any plywood or MDF, never chip boards", () => {
    for (const sledBuild of ["buildCrosscutSled", "buildStraightLineSled"]) {
      assert.deepStrictEqual(acceptedKinds(sledBuild), JIG_GRADE_KINDS);
    }
  });

  it("worktable tops and drawers add particle board, still refuse OSB", () => {
    for (const furnitureBuild of ["build-worktable1x1", "buildToolDrawers"]) {
      assert.deepStrictEqual(
        acceptedKinds(furnitureBuild),
        SHOP_FURNITURE_KINDS,
      );
    }
  });

  it("the rack takes only cheap sheets, protecting jig stock", () => {
    assert.deepStrictEqual(
      [...acceptedKinds("buildStorageRack")].sort(),
      [...RACK_GRADE_KINDS].sort(),
    );
  });

  it("together the recipes give every kind at least one use", () => {
    const used = new Set([
      ...JIG_GRADE_KINDS,
      ...SHOP_FURNITURE_KINDS,
      ...RACK_GRADE_KINDS,
    ]);
    for (const kind of SHEET_GOOD_KINDS) {
      assert.ok(used.has(kind), `${kind} has no recipe that accepts it`);
    }
  });
});

describe("storage rack", () => {
  it("builds as a machine from the bench", () => {
    const build = workspace.operations.find(
      (op) => op.id === "buildStorageRack",
    ) as MachineOperation;
    assert.deepStrictEqual(build.output([]).machineOutputs, ["storageRack"]);
  });

  it("out-shelves a worktable of the same footprint, and does nothing else", () => {
    const rack = MACHINE_TYPES.storageRack;
    assert.ok(
      rack.materialStorage > MACHINE_TYPES.worktable1x1.materialStorage,
    );
    assert.strictEqual(rack.operations.length, 0);
    assert.strictEqual(rack.toolSlots, 0);
  });
});
