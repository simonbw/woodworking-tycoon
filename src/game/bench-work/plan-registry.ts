import { ProgressionState } from "../GameState";
import { Operation } from "../Machine";
import { hasSkill } from "../skill-helpers";
import { TOOL_TYPES, ToolId } from "../Tool";
import { BENCH_OPERATIONS } from "../machines/benchOperations";
import {
  BlueprintId,
  ProductBlueprint,
  productBlueprintFor,
} from "./blueprint";

/**
 * The bench's plan drawer: every assembly build in the game, gathered
 * from wherever its operation is declared (the shared bench list, the
 * hammer, the drill) and filed under a category — the dividers the plan
 * browser shows. This registry exists so the browser can list a plan by
 * skill alone: a build whose driving tool isn't mounted still shows,
 * wearing the tool as a missing supply, instead of vanishing with the
 * tool (Machine.operations only knows what's mounted).
 *
 * A plan selected here may therefore name an operation the station
 * can't currently offer; selectedBenchPlan (tool-work.ts) resolves
 * through this registry for exactly that reason, and the commit path is
 * naturally safe — driving a fastener needs the tool in hand, which
 * needs it mounted.
 */

export const PLAN_CATEGORIES = [
  { id: "rustic", label: "Rustic Projects" },
  { id: "fineGoods", label: "Fine Goods" },
  { id: "furniture", label: "Furniture" },
  { id: "shopFurniture", label: "Shop Furniture" },
  { id: "jigs", label: "Jigs" },
] as const;

export type PlanCategoryId = (typeof PLAN_CATEGORIES)[number]["id"];

export function planCategoryLabel(id: PlanCategoryId): string {
  const category = PLAN_CATEGORIES.find((entry) => entry.id === id);
  return category ? category.label : id;
}

/**
 * Where each blueprint files, plus the pencil note in the drawing's
 * margin — the one place personality belongs (see the voice rules in
 * docs/shop-manual.md). `plan-registry.test.ts` holds this map complete:
 * every assembly operation's blueprint must have an entry.
 */
const PLAN_FACTS: Partial<
  Record<BlueprintId, { category: PlanCategoryId; note: string }>
> = {
  // Rustic: pallet wood, nailed or screwed, sold off the stand
  rusticShelf: {
    category: "rustic",
    note: "Six boards off one pallet — and the pallet gives the nails back too.",
  },
  rusticFrame: {
    category: "rustic",
    note: "Reclaimed wood cut to a tolerance it has never been held to.",
  },
  birdhouse: {
    category: "rustic",
    note: "The slit between the front boards is the door. Wrens aren't picky.",
  },
  crate: {
    category: "rustic",
    note: "Leave the gaps between the slats — that's the drainage.",
  },
  planterBox: {
    category: "rustic",
    note: "Screws, not nails. Wet soil works a nail loose by August.",
  },
  stepStool: {
    category: "rustic",
    note: "It takes a boot every day — every joint gets a screw.",
  },
  // Fine goods: mitered and sanded work
  pictureFrame: {
    category: "fineGoods",
    note: "Eight 45° cuts that all have to agree.",
  },
  hexFrame: {
    category: "fineGoods",
    note: "Six corners at 30°. Trust the angle stops.",
  },
  servingTray: {
    category: "fineGoods",
    note: 'The rail wrap only closes on a 12" bottom.',
  },
  jewelryBox: {
    category: "fineGoods",
    note: "Thin stock and light brads. No hurry.",
  },
  // Furniture: the pieces that furnish a room
  shelf: {
    category: "furniture",
    note: "The cleat carries it all — screw down the whole seam.",
  },
  bookshelf: {
    category: "furniture",
    note: "The grain you sanded is the grain they see.",
  },
  sideTable: {
    category: "furniture",
    note: "Every table is built upside down. Legs on end, top face-down.",
  },
  // Shop furniture: the shop building its own fixtures
  worktable1x1: {
    category: "shopFurniture",
    note: "Small, but it stands flat. That's a start.",
  },
  worktable1x2: {
    category: "shopFurniture",
    note: "The standard bench. Most of the shop happens here.",
  },
  worktable1x3: {
    category: "shopFurniture",
    note: "Room to lay a long board down at last.",
  },
  worktable2x2: {
    category: "shopFurniture",
    note: "Big enough to lose a tape measure on.",
  },
  storageRack: {
    category: "shopFurniture",
    note: "OSB is fine here. Save the good sheets for jigs.",
  },
  toolDrawers: {
    category: "shopFurniture",
    note: "A place for everything, right under the bench.",
  },
  materialShelf: {
    category: "shopFurniture",
    note: "Two planks across the stretchers — that's the whole build.",
  },
  // Jigs: shop-made tooling
  crosscutSled: {
    category: "jigs",
    note: "Build it square once, trust it forever.",
  },
  straightLineSled: {
    category: "jigs",
    note: "A straight edge for boards that don't have one.",
  },
  resawFence: {
    category: "jigs",
    note: "Tall enough to clear the blade, and no taller.",
  },
};

/** One drawing in the drawer. */
export interface BenchPlan {
  readonly operation: Operation;
  readonly blueprintId: BlueprintId;
  readonly blueprint: ProductBlueprint;
  readonly category: PlanCategoryId;
  /** The pencil note in the drawing's margin. */
  readonly note: string;
  /** The tool whose rail hook the operation lives on, or null for a
   * build every bench knows on its own. */
  readonly sourceToolId: ToolId | null;
}

function plansFrom(
  operations: ReadonlyArray<Operation>,
  sourceToolId: ToolId | null,
): BenchPlan[] {
  return operations.flatMap((operation) => {
    if (operation.interaction?.kind !== "assembly") {
      return [];
    }
    const blueprintId = operation.interaction.blueprint;
    const blueprint = productBlueprintFor(blueprintId);
    const facts = PLAN_FACTS[blueprintId];
    if (!blueprint || !facts) {
      // Surfaced loudly at module load: an assembly op outside the
      // registry would silently miss the plan browser otherwise.
      throw new Error(`The ${blueprintId} plan has no registry entry`);
    }
    return [
      {
        operation,
        blueprintId,
        blueprint,
        category: facts.category,
        note: facts.note,
        sourceToolId,
      },
    ];
  });
}

/**
 * Every assembly plan in the game, in category order (declaration order
 * within a category). Tool-borne plans keep their tool's id so readiness
 * can ask for it by name.
 */
export const ALL_BENCH_PLANS: ReadonlyArray<BenchPlan> = (() => {
  const plans = [
    ...plansFrom(BENCH_OPERATIONS, null),
    ...(Object.keys(TOOL_TYPES) as ToolId[]).flatMap((toolId) =>
      plansFrom(TOOL_TYPES[toolId].operations, toolId),
    ),
  ];
  const order = PLAN_CATEGORIES.map((category) => category.id as string);
  return plans
    .map((plan, index) => ({ plan, index }))
    .sort(
      (a, b) =>
        order.indexOf(a.plan.category) - order.indexOf(b.plan.category) ||
        a.index - b.index,
    )
    .map((entry) => entry.plan);
})();

/** The plans the player's skills unlock — the browser's whole listing.
 * Locked plans stay invisible; there are no grayed-out teasers. */
export function unlockedBenchPlans(
  progression: ProgressionState,
): ReadonlyArray<BenchPlan> {
  return ALL_BENCH_PLANS.filter(
    (plan) =>
      !plan.operation.requiredSkill ||
      hasSkill(progression, plan.operation.requiredSkill),
  );
}

/** The registry row behind an operation id, or null when the id isn't
 * an assembly plan (tool work, a direct-feed cut, "none"). */
export function benchPlanForOperationId(operationId: string): BenchPlan | null {
  return (
    ALL_BENCH_PLANS.find((plan) => plan.operation.id === operationId) ?? null
  );
}
