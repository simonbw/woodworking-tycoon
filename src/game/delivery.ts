import { getActiveCommission } from "./commissionSequence";
import { AcceptedJob, Commission, GameState } from "./GameState";
import { atTruckCab } from "./lot";
import { InputMaterialWithQuantity } from "./Machine";
import { MaterialInstance } from "./Materials";
import { materialMeetsInput } from "./material-helpers";
import { isNight } from "./time-flow";

/**
 * The matching rules shared by both outbound tracks. Commissions and jobs
 * are paid the same way — you load the goods into the truck's bed and
 * drive them out from the cab — so the check and the consume live here
 * rather than being copied into each track's actions, where they drifted
 * apart once already.
 *
 * This is the only way finished work leaves the shop: there is
 * deliberately no "mark complete" button. Handing work over is a
 * physical act with a payoff moment (the client card and reward flight,
 * src/components/payout/), and one matcher serves both tracks so a
 * piece that satisfies a commission satisfies the same-shaped job.
 *
 * What matches is here; the drive itself is in
 * `game-actions/delivery-actions.ts` — a delivery costs the same minutes
 * out and back that a store run does.
 */

/** Whether a pool of materials covers everything a work order asks for. */
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
 * Delivering is a physical act, so it wants the real body state: home,
 * standing at the truck's cab, not with a machine over the shoulders —
 * and the goods already loaded in the bed. Enforced in the actions
 * themselves and not only in `TruckPrompt` — where the delivery can
 * happen is a game rule.
 */
export function canHandOff(gameState: GameState): boolean {
  const { player } = gameState;
  return (
    !player.away &&
    !player.carriedMachine &&
    atTruckCab(gameState.shopInfo, player.position)
  );
}

/**
 * Everything in the truck's bed that somebody is waiting on right now:
 * the active commission and any accepted job whose deliverables are all
 * loaded. The cab's card lists these, and `resolveInteract` consults the
 * count so the cab still answers for the very first commission — which is
 * delivered before any destination is unlocked.
 *
 * Empty after close, the way the other destinations leave the card:
 * delivering is a drive, and nobody is taking delivery at night.
 */
export type ReadyHandoff =
  | { readonly kind: "commission"; readonly commission: Commission }
  | { readonly kind: "job"; readonly job: AcceptedJob };

export function readyHandoffs(
  gameState: GameState,
): ReadonlyArray<ReadyHandoff> {
  if (!canHandOff(gameState) || isNight(gameState)) {
    return [];
  }
  const { bed } = gameState.truck;
  const handoffs: ReadyHandoff[] = [];

  const commission = getActiveCommission(gameState.progression);
  if (commission && hasRequiredMaterials(bed, commission.requiredMaterials)) {
    handoffs.push({ kind: "commission", commission });
  }
  for (const job of gameState.acceptedJobs) {
    if (hasRequiredMaterials(bed, job.requiredMaterials)) {
      handoffs.push({ kind: "job", job });
    }
  }
  return handoffs;
}
