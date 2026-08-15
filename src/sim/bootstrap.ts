import { Game } from "../core/Game";
import {
  defaultParametersFor,
  MACHINE_TYPES,
  MachineId,
  MachineState,
  ParameterValues,
} from "../game/Machine";
import { ToolId } from "../game/Tool";
import { Direction } from "../game/Vectors";
import { SaveFile, loadSaveFile } from "./save/SaveFile";
import { MachineEntity } from "./entities/MachineEntity";
import { Player } from "./entities/Player";
import { StandEntity } from "./entities/StandEntity";
import { TruckEntity } from "./entities/TruckEntity";
import { Clock } from "./singletons/Clock";
import { Consumables } from "./singletons/Consumables";
import { Progression } from "./singletons/Progression";
import { Reputation } from "./singletons/Reputation";
import { ShopInfo } from "./singletons/ShopInfo";
import { StorageUpgrades } from "./singletons/StorageUpgrades";
import { TutorialTracker } from "./singletons/TutorialTracker";
import { DustLayer } from "./singletons/DustLayer";
import { Wallet } from "./singletons/Wallet";
import { MachineSystem } from "./systems/MachineSystem";
import { MilestoneSystem } from "./systems/MilestoneSystem";
import { StreetSystem } from "./systems/StreetSystem";
import { TimeFlow } from "./TimeFlow";

/**
 * World setup shared by every way a game starts: the browser shell, the
 * headless driver, and tests.
 *
 * The session singletons (TimeFlow — transient, above save persistence)
 * are added once per Game. The persistent singletons come either fresh
 * (a new shop) or from a save file; loading clears the persistent scene
 * first, so booting from a save on a fresh Game and loading one into a
 * running Game are the same path.
 */

/** Add the session-lifetime singletons every game needs exactly once. */
export function addSessionSingletons(game: Game): void {
  game.addEntity(new TimeFlow());
  game.addEntity(new MachineSystem());
  game.addEntity(new MilestoneSystem());
  game.addEntity(new StreetSystem());
}

/** Add a fresh shop's persistent singletons (a brand-new game). */
export function addFreshShopSingletons(game: Game): void {
  game.addEntity(new Player());
  game.addEntity(new Clock());
  game.addEntity(new Wallet());
  game.addEntity(new Reputation());
  game.addEntity(new Consumables());
  game.addEntity(new StorageUpgrades());
  game.addEntity(new ShopInfo());
  game.addEntity(new Progression());
  game.addEntity(new TutorialTracker());
  game.addEntity(new DustLayer());
  game.addEntity(new TruckEntity());
  game.addEntity(new StandEntity());

  // The starter floor, exactly the old initialGameState's: a workspace
  // with the starter hammer, a garbage can, and a small lumber shelf.
  game.addEntity(
    new MachineEntity(machine("workspace", [2, 2], 0, ["hammer"])),
  );
  game.addEntity(new MachineEntity(machine("garbageCan", [0, 13], 0)));
  game.addEntity(new MachineEntity(machine("lumberShelf", [8, 0], 0)));
}

/** The old initialGameState's machine() helper, verbatim. */
function machine(
  machineTypeId: MachineId,
  position: [number, number],
  rotation: Direction,
  tools: ReadonlyArray<ToolId> = [],
): MachineState {
  const machineType = MACHINE_TYPES[machineTypeId];
  const firstOperation = machineType.operations[0];
  const selectedParameters: ParameterValues | undefined = firstOperation
    ? defaultParametersFor(firstOperation)
    : undefined;

  return {
    machineTypeId,
    position,
    rotation,
    inputMaterials: [],
    processingMaterials: [],
    outputMaterials: [],
    tools,
    storedMaterials: [],
    selectedOperationId: firstOperation ? firstOperation.id : "none",
    selectedParameters,
    operationProgress: {
      status: "notStarted",
      phaseIndex: 0,
      ticksRemaining: 0,
    },
  };
}

/** Boot a world: session singletons plus a fresh shop or a save file. */
export function bootShop(game: Game, save?: SaveFile): void {
  addSessionSingletons(game);
  if (save) {
    loadSaveFile(game, save);
  } else {
    addFreshShopSingletons(game);
  }
}
