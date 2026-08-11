import { describe, it } from "node:test";
import assert from "node:assert";
import { handToolsShop } from "../../../tests/fixtures/hand-tools-shop";
import { palletBoard } from "../board-helpers";
import { GameState } from "../GameState";
import { Machine } from "../Machine";
import { STARTER_SKILLS } from "../Skill";
import { TOOL_TYPES, ToolId } from "../Tool";
import { BENCH_OPERATIONS } from "../machines/benchOperations";
import { planReadiness } from "./plan-readiness";
import {
  ALL_BENCH_PLANS,
  benchPlanForOperationId,
  PLAN_CATEGORIES,
  unlockedBenchPlans,
} from "./plan-registry";

describe("plan registry", () => {
  it("files every assembly operation exactly once", () => {
    const assemblyIds = [
      ...BENCH_OPERATIONS,
      ...(Object.keys(TOOL_TYPES) as ToolId[]).flatMap(
        (toolId) => TOOL_TYPES[toolId].operations,
      ),
    ]
      .filter((operation) => operation.interaction?.kind === "assembly")
      .map((operation) => operation.id)
      .sort();
    const planIds = ALL_BENCH_PLANS.map((plan) => plan.operation.id).sort();
    assert.deepEqual(planIds, assemblyIds);
    assert.equal(new Set(planIds).size, planIds.length);
  });

  it("lists plans in category order", () => {
    const order = PLAN_CATEGORIES.map((category) => category.id as string);
    const seen = ALL_BENCH_PLANS.map((plan) => order.indexOf(plan.category));
    assert.deepEqual(
      seen,
      [...seen].sort((a, b) => a - b),
    );
  });

  it("keeps every plan's margin note in the manual's plain-note shape", () => {
    for (const plan of ALL_BENCH_PLANS) {
      assert.ok(plan.note.length > 0, `${plan.blueprintId} has no note`);
      assert.ok(
        plan.note.length < 90,
        `${plan.blueprintId}'s note runs too long for a margin`,
      );
    }
  });

  it("a brand-new shop's drawer holds only the rustic shelf", () => {
    const unlocked = unlockedBenchPlans({
      unlockedSkills: STARTER_SKILLS,
    } as never);
    assert.deepEqual(
      unlocked.map((plan) => plan.operation.id),
      ["buildRusticPalletShelf"],
    );
  });

  it("resolves an operation id to its plan, and non-plans to null", () => {
    assert.equal(
      benchPlanForOperationId("buildRusticPalletShelf")?.blueprintId,
      "rusticShelf",
    );
    assert.equal(benchPlanForOperationId("handSawCut"), null);
    assert.equal(benchPlanForOperationId("none"), null);
  });
});

describe("plan readiness", () => {
  const shelfPlan = benchPlanForOperationId("buildRusticPalletShelf")!;

  function stateWith(overrides: (state: GameState) => GameState): GameState {
    return overrides(handToolsShop as unknown as GameState);
  }

  function bench(state: GameState): Machine {
    const machineState = state.machines.find(
      (m) => m.machineTypeId === "workspace",
    )!;
    return new Machine(machineState);
  }

  it("reads the cutting list against shop-wide stock", () => {
    const state = stateWith((s) => ({
      ...s,
      materialPiles: [
        ...s.materialPiles,
        ...Array.from({ length: 6 }, (_, i) => ({
          material: palletBoard(),
          position: [i, 0] as [number, number],
          rotation: 0,
        })),
      ],
      consumables: { ...s.consumables, nails: 8 },
    }));
    const readiness = planReadiness(state, bench(state), shelfPlan);
    // Six identical slots fold to one row of six
    assert.equal(readiness.rows.length, 1);
    assert.equal(readiness.rows[0].need, 6);
    assert.ok(readiness.rows[0].have >= 6);
    assert.equal(readiness.consumables[0].cost.id, "nails");
    // The hammer isn't on this fixture's bench, so the build can't start
    assert.equal(readiness.tool?.toolId, "hammer");
    assert.notEqual(readiness.tool?.status, "mounted");
    assert.equal(readiness.ready, false);
  });

  it("goes ready when the driving tool is mounted and the bill is met", () => {
    const state = stateWith((s) => ({
      ...s,
      machines: s.machines.map((m) =>
        m.machineTypeId === "workspace" ? { ...m, tools: ["hammer"] } : m,
      ),
      materialPiles: [
        ...s.materialPiles,
        ...Array.from({ length: 6 }, (_, i) => ({
          material: palletBoard(),
          position: [i, 0] as [number, number],
          rotation: 0,
        })),
      ],
      consumables: { ...s.consumables, nails: 8 },
    })) as GameState;
    const readiness = planReadiness(state, bench(state), shelfPlan);
    assert.equal(readiness.tool?.status, "mounted");
    assert.equal(readiness.ready, true);
  });

  it("counts a loose tool item as in the shop", () => {
    const state = stateWith((s) => ({
      ...s,
      // The fixture's truck bed carries no tools; the drill in the test
      // above rides the bed in the sequence tests, so borrow that shape
      truck: {
        ...s.truck,
        bed: [
          ...s.truck.bed,
          { id: "t1", type: "tool" as const, toolId: "hammer" as const },
        ],
      },
    }));
    const readiness = planReadiness(state, bench(state), shelfPlan);
    assert.equal(readiness.tool?.status, "inShop");
  });
});
