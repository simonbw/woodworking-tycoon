import { TutorialFacts } from "../../../game/GameState";
import { MachineId } from "../../../game/Machine";
import { MaterialInstance } from "../../../game/Materials";
import {
  activeTutorialSteps,
  TutorialDomTargetId,
} from "../../../game/tutorial";

/**
 * Every up tutorial card's current-step targets, merged and sorted into
 * the shapes the things that draw them actually take: a set of machine
 * types, a truck part, a pile predicate, and the chrome ids
 * TutorialSpotlightLayer measures. Two cards can point at once — the
 * opening at the bench, the sweeping lesson at the can — and the world
 * simply wears both outlines.
 *
 * Everything is empty once the tutorials are finished or skipped, so
 * callers can wire this in unconditionally and pay nothing afterward.
 *
 */

/** The targeting treatment the truck wears: the whole body when the cab
 * is the destination, just the cargo box when the bed is. */
export type TruckHighlight = "truck" | "bed" | null;

export interface TutorialWorldTargets {
  readonly machineTypeIds: ReadonlySet<MachineId>;
  readonly truck: TruckHighlight;
  readonly stand: boolean;
  readonly broom: boolean;
  readonly matchesPile: ((material: MaterialInstance) => boolean) | null;
  readonly domIds: ReadonlyArray<TutorialDomTargetId>;
}

const NOTHING: TutorialWorldTargets = {
  machineTypeIds: new Set(),
  truck: null,
  stand: false,
  broom: false,
  matchesPile: null,
  domIds: [],
};

export function tutorialTargets(
  gameState: TutorialFacts,
): TutorialWorldTargets {
  const steps = activeTutorialSteps(gameState);
  if (steps.length === 0) return NOTHING;

  const machineTypeIds = new Set<MachineId>();
  const domIds: TutorialDomTargetId[] = [];
  let truck: TruckHighlight = null;
  let stand = false;
  let broom = false;
  const pileMatchers: Array<(material: MaterialInstance) => boolean> = [];

  for (const step of steps) {
    for (const target of step.targets) {
      switch (target.kind) {
        case "machine":
          machineTypeIds.add(target.machineTypeId);
          break;
        case "truck":
          truck = truck ?? (target.part === "cab" ? "truck" : "bed");
          break;
        case "stand":
          stand = true;
          break;
        case "broom":
          broom = true;
          break;
        case "pile":
          pileMatchers.push(target.match);
          break;
        case "dom":
          domIds.push(target.id);
          break;
      }
    }
  }
  const matchesPile =
    pileMatchers.length === 0
      ? null
      : (material: MaterialInstance) =>
          pileMatchers.some((matches) => matches(material));
  return { machineTypeIds, truck, stand, broom, matchesPile, domIds };
}
