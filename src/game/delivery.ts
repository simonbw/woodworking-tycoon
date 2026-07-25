import { getActiveCommission } from "./commissionSequence";
import { AcceptedJob, Commission, GameState } from "./GameState";
import { InputMaterialWithQuantity } from "./Machine";
import { MaterialInstance } from "./Materials";
import { materialMeetsInput } from "./material-helpers";
import { isAtShopDoor } from "./ShopInfo";

/**
 * The matching rules shared by both outbound tracks. Commissions and jobs
 * are paid the same way — you hand over what you're carrying — so the
 * check and the consume live here rather than being copied into
 * `store-actions` and `marketplace-actions`, where they drifted apart once
 * already.
 */

/** Whether the player is carrying everything a work order asks for. */
export function hasRequiredMaterials(
  inventory: ReadonlyArray<MaterialInstance>,
  requirements: ReadonlyArray<InputMaterialWithQuantity>,
): boolean {
  return consumeRequiredMaterials(inventory, requirements) !== null;
}

/**
 * The inventory left after handing the requirements over, or null when the
 * player is short. Each requirement takes the first matching items it
 * finds, and an item already claimed by an earlier requirement can't be
 * counted twice.
 */
export function consumeRequiredMaterials(
  inventory: ReadonlyArray<MaterialInstance>,
  requirements: ReadonlyArray<InputMaterialWithQuantity>,
): ReadonlyArray<MaterialInstance> | null {
  let remaining = [...inventory];
  for (const requirement of requirements) {
    let stillNeeded = requirement.quantity;
    const kept: MaterialInstance[] = [];
    for (const material of remaining) {
      if (stillNeeded > 0 && materialMeetsInput(material, requirement)) {
        stillNeeded--;
      } else {
        kept.push(material);
      }
    }
    if (stillNeeded > 0) {
      return null;
    }
    remaining = kept;
  }
  return remaining;
}

/**
 * Handing goods over is a physical act, so it wants the same body state as
 * walking out the door: home, standing at the garage door, and not with a
 * machine over your shoulders. Enforced in the actions themselves and not
 * only in `DoorPrompt` — where the delivery can happen is a game rule.
 */
export function canHandOff(gameState: GameState): boolean {
  const { player } = gameState;
  return (
    !player.away &&
    !player.carriedMachine &&
    isAtShopDoor(gameState.shopInfo, player.position)
  );
}

/**
 * Everything the player is currently carrying that somebody is waiting on:
 * the active commission and any accepted job whose deliverables are all in
 * hand. The garage door lists these, and `resolveInteract` consults the
 * count so the door still opens for the very first commission — which is
 * handed over before any destination is unlocked.
 */
export type ReadyHandoff =
  | { readonly kind: "commission"; readonly commission: Commission }
  | { readonly kind: "job"; readonly job: AcceptedJob };

export function readyHandoffs(
  gameState: GameState,
): ReadonlyArray<ReadyHandoff> {
  if (!canHandOff(gameState)) {
    return [];
  }
  const { inventory } = gameState.player;
  const handoffs: ReadyHandoff[] = [];

  const commission = getActiveCommission(gameState.progression);
  if (
    commission &&
    hasRequiredMaterials(inventory, commission.requiredMaterials)
  ) {
    handoffs.push({ kind: "commission", commission });
  }
  for (const job of gameState.acceptedJobs) {
    if (hasRequiredMaterials(inventory, job.requiredMaterials)) {
      handoffs.push({ kind: "job", job });
    }
  }
  return handoffs;
}
