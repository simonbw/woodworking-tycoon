import { ConsumableAmount } from "../Consumable";
import { GameState } from "../GameState";
import {
  defaultParametersFor,
  InputMaterialWithQuantity,
  Machine,
} from "../Machine";
import { MaterialInstance } from "../Materials";
import { materialMeetsInput } from "../material-helpers";
import { ToolId } from "../Tool";
import { fastenerToolId } from "./blueprint";
import { BenchPlan } from "./plan-registry";

/**
 * What a plan needs against what the shop has, read shop-wide: hauling
 * is cheap, so "it's across the room" is not a shortfall. Each
 * requirement row counts independently — a board that would satisfy two
 * rows counts in both, which errs on the encouraging side and keeps the
 * readout legible.
 */

export interface PlanRequirementRow {
  readonly requirement: InputMaterialWithQuantity;
  readonly need: number;
  readonly have: number;
}

export interface PlanConsumableRow {
  readonly cost: ConsumableAmount;
  readonly have: number;
}

/** Where the plan's driving tool is, nearest first: on this bench's
 * rail, somewhere in the shop (another station's rail, a shelf, the
 * floor, the truck), or not owned at all. */
export type PlanToolStatus = "mounted" | "inShop" | "missing";

export interface PlanToolRow {
  readonly toolId: ToolId;
  readonly status: PlanToolStatus;
}

export interface PlanReadiness {
  readonly rows: ReadonlyArray<PlanRequirementRow>;
  readonly consumables: ReadonlyArray<PlanConsumableRow>;
  /** Null for a fastener-less build (the material shelf). */
  readonly tool: PlanToolRow | null;
  /** Everything above is satisfied: the build can start at this bench
   * right now, give or take carrying the stock over. */
  readonly ready: boolean;
}

/** Every loose material in the shop: floor piles, machine bays and
 * shelves, the player's hands, and the truck's bed. */
export function allShopMaterials(
  gameState: GameState,
): ReadonlyArray<MaterialInstance> {
  return [
    ...gameState.materialPiles.map((pile) => pile.material),
    ...gameState.machines.flatMap((machine) => [
      ...machine.inputMaterials,
      ...machine.outputMaterials,
      ...(machine.storedMaterials ?? []),
    ]),
    ...gameState.player.inventory,
    ...gameState.truck.bed,
  ];
}

function toolStatus(
  gameState: GameState,
  machine: Machine,
  toolId: ToolId,
): PlanToolStatus {
  if (machine.state.tools.includes(toolId)) {
    return "mounted";
  }
  const mountedElsewhere = gameState.machines.some((m) =>
    m.tools.includes(toolId),
  );
  const looseInShop = allShopMaterials(gameState).some(
    (material) => material.type === "tool" && material.toolId === toolId,
  );
  return mountedElsewhere || looseInShop ? "inShop" : "missing";
}

/** The plan's whole bill, read against the shop's stock. */
export function planReadiness(
  gameState: GameState,
  machine: Machine,
  plan: BenchPlan,
): PlanReadiness {
  const stock = allShopMaterials(gameState);
  const rows = plan.operation
    .getInputMaterials(defaultParametersFor(plan.operation))
    .map((requirement) => ({
      requirement,
      need: requirement.quantity,
      have: stock.filter((material) =>
        materialMeetsInput(material, requirement),
      ).length,
    }));

  const consumables = (plan.operation.requiredConsumables ?? []).map(
    (cost) => ({
      cost,
      have: gameState.consumables[cost.id] ?? 0,
    }),
  );

  const tool =
    plan.blueprint.fasteners.length > 0
      ? {
          toolId: fastenerToolId(plan.blueprint.fastenerConsumable),
          status: toolStatus(
            gameState,
            machine,
            fastenerToolId(plan.blueprint.fastenerConsumable),
          ),
        }
      : null;

  return {
    rows,
    consumables,
    tool,
    ready:
      rows.every((row) => row.have >= row.need) &&
      consumables.every((row) => row.have >= row.cost.amount) &&
      (tool === null || tool.status === "mounted"),
  };
}
