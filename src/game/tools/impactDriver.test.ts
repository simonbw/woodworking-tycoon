import assert from "node:assert";
import { describe, it } from "node:test";
import { Machine, MachineId, Operation } from "../Machine";
import { ToolId } from "../Tool";
import { drill } from "./drill";
import { hammer } from "./hammer";
import { impactDriver, IMPACT_DRIVER_SPEED_FACTOR } from "./impactDriver";

const buildPlanterBox = drill.operations.find(
  (op) => op.id === "buildPlanterBox",
) as Operation;
const buildBirdhouse = hammer.operations.find(
  (op) => op.id === "buildBirdhouse",
) as Operation;

function benchWith(
  tools: ToolId[],
  machineTypeId: MachineId = "workspace",
): Machine {
  return new Machine({
    machineTypeId,
    position: [0, 0],
    rotation: 0,
    selectedOperationId: "none",
    operationProgress: { status: "notStarted", phaseIndex: 0, ticksRemaining: 0 },
    inputMaterials: [],
    processingMaterials: [],
    outputMaterials: [],
    tools,
  });
}

describe("impact driver", () => {
  it("has no operations of its own — screwed assembly stays a drill trade", () => {
    assert.strictEqual(impactDriver.operations.length, 0);
    assert.ok(!impactDriver.craftedOnly);
  });

  it("speeds up screw recipes when mounted alongside the drill", () => {
    const bench = benchWith(["drill", "impactDriver"]);
    assert.strictEqual(
      bench.workSpeedFor(buildPlanterBox),
      IMPACT_DRIVER_SPEED_FACTOR,
    );
  });

  it("does nothing without the drill to pair with", () => {
    assert.strictEqual(
      benchWith(["impactDriver"]).workSpeedFor(buildPlanterBox),
      1,
    );
    assert.strictEqual(benchWith(["drill"]).workSpeedFor(buildPlanterBox), 1);
  });

  it("leaves recipes that don't drive screws alone", () => {
    const bench = benchWith(["drill", "impactDriver", "hammer"]);
    // Nailed joinery swings a hammer — no pilots, no screws, no bonus
    assert.strictEqual(bench.workSpeedFor(buildBirdhouse), 1);
  });

  it("stacks with the worktable's own work speed", () => {
    const table = benchWith(["drill", "impactDriver"], "worktable1x2");
    assert.strictEqual(
      table.workSpeedFor(buildPlanterBox),
      1.25 * IMPACT_DRIVER_SPEED_FACTOR,
    );
  });
});
