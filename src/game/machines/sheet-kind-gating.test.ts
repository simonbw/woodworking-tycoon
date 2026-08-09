import assert from "node:assert";
import { describe, it } from "node:test";
import { MACHINE_TYPES, Operation } from "../Machine";
import { makeMaterial, materialMeetsInput } from "../material-helpers";
import { SHEET_GOOD_KINDS, SheetGood, SheetGoodKind } from "../Materials";
import {
  JIG_GRADE_KINDS,
  RACK_GRADE_KINDS,
  SHOP_FURNITURE_KINDS,
} from "./benchOperations";
import { workspace } from "./workspace";

/** A piece cut to whatever size the recipe under test asks for — this
 * suite is about which KINDS pass, so the size is never the reason. */
function sheet(kind: SheetGoodKind, lengthIn: number, widthIn: number) {
  return makeMaterial<SheetGood>({
    type: "plywood",
    kind,
    length: lengthIn,
    width: widthIn,
    thickness: 2,
  });
}

function sheetRequirementOf(operationId: string) {
  const operation = workspace.operations.find(
    (op) => op.id === operationId,
  ) as Operation;
  assert.ok(operation, `${operationId} should exist on the bench`);
  const requirement = operation
    .getInputMaterials({})
    .find((req) =>
      (req.type as ReadonlyArray<string> | undefined)?.includes("plywood"),
    );
  assert.ok(requirement, `${operationId} should take a sheet`);
  return requirement;
}

function acceptedKinds(operationId: string): ReadonlyArray<SheetGoodKind> {
  const requirement = sheetRequirementOf(operationId);
  const lengthIn = (requirement as { length?: number[] }).length?.[0];
  const widthIn = (requirement as { width?: number[] }).width?.[0];
  assert.ok(
    lengthIn !== undefined && widthIn !== undefined,
    `${operationId} should ask for a sheet cut to a size`,
  );
  return SHEET_GOOD_KINDS.filter((kind) =>
    materialMeetsInput(sheet(kind, lengthIn, widthIn), requirement),
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
    ) as Operation;
    assert.deepStrictEqual(build.output([], {}).machineOutputs, [
      "storageRack",
    ]);
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
