import { GameState } from "../../game/GameState";
import { MachineId } from "../../game/Machine";
import { MaterialInstance } from "../../game/Materials";
import { currentTutorialStep, TutorialDomTargetId } from "../../game/tutorial";
import { TruckHighlight } from "../shop-view/TruckSprite";

/**
 * The current tutorial step's targets, sorted into the shapes the things
 * that draw them actually take: a set of machine types, a truck part, a
 * pile predicate, and the chrome ids TutorialSpotlightLayer measures.
 *
 * Everything is empty once the tutorial is finished or skipped, so callers
 * can wire this in unconditionally and pay nothing afterward.
 */
export interface TutorialWorldTargets {
  readonly machineTypeIds: ReadonlySet<MachineId>;
  readonly truck: TruckHighlight;
  readonly matchesPile: ((material: MaterialInstance) => boolean) | null;
  readonly domIds: ReadonlyArray<TutorialDomTargetId>;
}

const NOTHING: TutorialWorldTargets = {
  machineTypeIds: new Set(),
  truck: null,
  matchesPile: null,
  domIds: [],
};

export function tutorialTargets(gameState: GameState): TutorialWorldTargets {
  const step = currentTutorialStep(gameState);
  if (step === null) return NOTHING;

  const machineTypeIds = new Set<MachineId>();
  const domIds: TutorialDomTargetId[] = [];
  let truck: TruckHighlight = null;
  let matchesPile: ((material: MaterialInstance) => boolean) | null = null;

  for (const target of step.targets) {
    switch (target.kind) {
      case "machine":
        machineTypeIds.add(target.machineTypeId);
        break;
      case "truck":
        truck = target.part === "cab" ? "truck" : "bed";
        break;
      case "pile":
        matchesPile = target.match;
        break;
      case "dom":
        domIds.push(target.id);
        break;
    }
  }
  return { machineTypeIds, truck, matchesPile, domIds };
}
