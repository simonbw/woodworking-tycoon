import { Game } from "../../core/Game";
import { canPickUpMachine } from "../../game/game-actions/machine-actions";
import { heldTool, holdingBroom } from "../../game/HeldTool";
import { resolveInteract } from "../../game/interact";
import { atTruckBed } from "../../game/lot";
import {
  getMachines,
  hasFloorControls,
  isSameMachine,
  Machine,
} from "../../game/Machine";
import {
  findFeedableOperation,
  liveSettingParameter,
  parameterValueSatisfiable,
  slideStock,
  stageableMaterials,
} from "../../game/machine-helpers";
import { handSpaceLeft } from "../../game/Person";
import { atStand, isSellable } from "../../game/stand";
import { availableOperations } from "../../game/skill-helpers";
import { chebyshevDistance } from "../../game/Vectors";
import { MachineEntity } from "../entities/MachineEntity";
import { MaterialPileEntity } from "../entities/MaterialPileEntity";
import { Player } from "../entities/Player";
import { projectGameState } from "../projection";
import { pickUpBroom, putDownBroom } from "./cleaning-commands";
import {
  findMachineEntity,
  moveMaterialsToMachine,
  operateMachine,
  pickUpCrate,
  pickUpMachine,
  putDownCarriedMachine,
  setMachineOperation,
  setMachineSettings,
  takeInputsFromMachine,
  takeOutputsFromMachine,
  toggleMachinePower,
} from "./machine-commands";
import { dropMaterial, pickUpMaterial } from "./pile-commands";
import { setOutAtStand, takeFromStand } from "./stand-commands";
import {
  takeCrateFromTruck,
  takeFromTruckBed,
  loadTruckBed,
} from "./truck-commands";

/**
 * The composite interaction commands — the old ShopKeyboardShortcuts
 * handler bodies, rehosted. The dispatcher stays logic-free (the plan's
 * command-layer rule): each of these owns one key's whole decision and
 * calls the underlying commands; the driver and the hint chips share the
 * same resolvers, so the key never surprises.
 *
 * "What the key acts on" (the targeted machine, the rummage cursor)
 * arrives as arguments — targeting is shell state, not sim state.
 */

const mod = (n: number, m: number) => ((n % m) + m) % m;

/** The old util's modulo, local so the sim owns its arithmetic. */

function player(game: Game): Player {
  return game.entities.getSingleton(Player);
}

/**
 * The B key's three-way toggle: put down what's carried, else unpack the
 * crate underfoot (or at the truck's bed), else hoist the targeted
 * machine.
 */
export function carryMachineToggle(
  game: Game,
  targeted: MachineEntity | null,
): void {
  const gs = projectGameState(game);
  const thePlayer = player(game);
  if (thePlayer.carriedMachine) {
    putDownCarriedMachine(game);
    return;
  }
  const crateUnderfoot = gs.machineCrates.some(
    (crate) => chebyshevDistance(crate.position, gs.player.position) <= 1,
  );
  if (crateUnderfoot) {
    pickUpCrate(game);
    return;
  }
  if (
    gs.truck.crates.length > 0 &&
    atTruckBed(gs.shopInfo, gs.player.position)
  ) {
    takeCrateFromTruck(game);
    return;
  }
  if (targeted && canPickUpMachine(gs, targeted.state)) {
    pickUpMachine(game, targeted);
  }
}

/**
 * The E key: take finished work, unload a bay, switch the machine on,
 * pick up the floor, take from the bed or the stand — whichever the
 * shared resolver says applies here. Returns "truck-cab" when the press
 * should open the trip card (shell state, so the dispatcher owns it).
 */
export function interactHere(
  game: Game,
  targeted: MachineEntity | null,
  pileOffset: number,
  shift: boolean,
): "truck-cab" | null {
  const gs = projectGameState(game);
  const targetedView = targeted ? targeted.view() : undefined;
  const action = resolveInteract(gs, targetedView, pileOffset);
  if (!action) return null;
  const space = handSpaceLeft(gs.player);
  switch (action.kind) {
    case "take-outputs": {
      const entity = findMachineEntity(game, action.machine.state);
      if (!entity) return null;
      takeOutputsFromMachine(
        game,
        shift
          ? action.machine.outputMaterials.slice(0, space)
          : [action.machine.outputMaterials[0]],
        entity,
      );
      return null;
    }
    case "take-inputs": {
      const entity = findMachineEntity(game, action.machine.state);
      if (!entity) return null;
      takeInputsFromMachine(
        game,
        shift
          ? action.machine.inputMaterials.slice(0, space)
          : [action.machine.inputMaterials[0]],
        entity,
      );
      return null;
    }
    case "switch-on":
    case "switch-off": {
      const entity = findMachineEntity(game, action.machine.state);
      if (entity) toggleMachinePower(game, entity);
      return null;
    }
    case "pick-up-floor": {
      // Grab the piece R rummaged to (the top of the pile by default).
      // Shift's armful starts there too and wraps around the pile. The
      // resolver hands back pile *data*; map to the live entities by the
      // material's id (unique per instance).
      const piles = action.piles;
      const from = piles.indexOf(action.target);
      const wanted = shift
        ? [...piles.slice(from), ...piles.slice(0, from)].slice(0, space)
        : [action.target];
      const entities = [...game.entities.byConstructor(MaterialPileEntity)];
      const targets = wanted
        .map((pile) =>
          entities.find((entity) => entity.material.id === pile.material.id),
        )
        .filter((entity): entity is MaterialPileEntity => entity != null);
      if (targets.length > 0) pickUpMaterial(game, targets);
      return null;
    }
    case "pick-up-broom":
      pickUpBroom(game);
      return null;
    case "truck-bed": {
      const bed = gs.truck.bed;
      takeFromTruckBed(game, shift ? bed.slice(-space) : [bed[bed.length - 1]]);
      return null;
    }
    case "stand":
      takeFromStand(game, shift ? space : 1);
      return null;
    case "truck-cab":
      return "truck-cab";
  }
  return null;
}

/**
 * The F key: hand stock to the targeted machine if it takes it, load the
 * truck's bed, set sellable work out at the stand, lean the broom, or
 * set the piece down at the body's feet — the old put-down handler.
 */
export function putDownHere(
  game: Game,
  targeted: MachineEntity | null,
  shift: boolean,
): void {
  const gs = projectGameState(game);
  const thePlayer = player(game);
  const inventory = thePlayer.inventory;
  if (inventory.length === 0) {
    // Empty-handed except for the broom: F leans it right here
    if (holdingBroom(gs)) putDownBroom(game);
    return;
  }

  // At the truck's bed, F loads over the rail instead of dropping
  if (atTruckBed(gs.shopInfo, gs.player.position)) {
    loadTruckBed(game, shift ? [...inventory] : [inventory[0]]);
    return;
  }

  // At the for-sale stand, F sets sellable work out on the table
  if (atStand(gs.shopInfo, gs.player.position)) {
    const sellable = inventory.filter(isSellable);
    if (sellable.length > 0) {
      setOutAtStand(game, shift ? sellable : [sellable[0]]);
      return;
    }
  }

  if (targeted && targeted.state.operationProgress.status !== "inProgress") {
    const stageable = stageableMaterials(
      targeted.view(),
      inventory,
      gs.progression,
    );
    if (stageable.length > 0) {
      const staged = shift ? stageable : [stageable[0]];
      moveMaterialsToMachine(game, staged, targeted);
      // A power-feed machine has no separate trigger: the rollers grab
      // the board the moment it touches them, so setting it down *is*
      // starting it. (Read from the post-stage state.)
      if (targeted.type.directFeed) {
        const restaged = targeted.view();
        const match = findFeedableOperation(
          restaged,
          availableOperations(restaged, projectGameState(game).progression),
          restaged.inputMaterials,
        );
        if (match?.operation.powerFeed === true) {
          operateMachine(game, targeted);
        }
      }
      return;
    }
  }

  // The piece lands at the body's actual position and keeps the
  // orientation it was carried in — the person sprite draws a quarter
  // turn off the heading, so the same offset lays the piece down exactly
  // as it looked in the arms. `heading` is the body's continuous facing
  // (unlike the quantized `direction`), so a piece dropped mid-diagonal
  // keeps that angle instead of snapping to one of four.
  dropMaterial(
    game,
    shift ? [...inventory] : [inventory[0]],
    [...thePlayer.position],
    thePlayer.heading + Math.PI / 2,
  );
}

/**
 * The held operate key starting the targeted machine — refused while a
 * tool in hand owns the hold (sweeping runs off the held flag).
 */
export function operateTargeted(
  game: Game,
  targeted: MachineEntity | null,
): void {
  if (heldTool(projectGameState(game)) !== null) return;
  if (!targeted) return;
  operateMachine(game, targeted);
}

/**
 * Step one of the machine's settings — the keyboard equivalent of the
 * scales on its card, ported from the old stepSetting with the slide
 * reachability walk.
 */
export function stepMachineSetting(
  game: Game,
  targeted: MachineEntity | null,
  kind: "linear" | "rotate",
  step: 1 | -1,
  coarse = false,
): void {
  if (!targeted) return;
  const gs = projectGameState(game);
  const machine = targeted.view();

  const directFeed = machine.type.directFeed === true;
  const found = liveSettingParameter(machine, gs.progression, kind);
  if (!found) return;
  const { operation, parameter: param } = found;

  // Unset reads as the declared default — what the chip already shows —
  // so the first press steps off it instead of jumping to the scale's
  // first mark.
  const current = machine.selectedParameters?.[param.id] ?? param.defaultValue;
  const currentIndex =
    current === undefined ? -1 : param.values.indexOf(current);
  const detents = coarse ? (param.coarseStep ?? 1) : 1;
  let next =
    param.values[mod(currentIndex + step * detents, param.values.length)];

  // A slide param moves the stock itself, so the key steps between the
  // marks the stock can actually reach.
  if (param.presentation === "slide") {
    const stock = slideStock(machine, [operation]);
    let nextIndex = param.values.indexOf(next);
    for (
      let tries = 0;
      tries < param.values.length &&
      !parameterValueSatisfiable(
        machine,
        operation,
        param.id,
        param.values[nextIndex],
        stock ? [stock] : [],
      );
      tries++
    ) {
      nextIndex = mod(nextIndex + step, param.values.length);
    }
    next = param.values[nextIndex];
  }

  if (directFeed) {
    // Settings turn without touching what's selected or running
    setMachineSettings(game, targeted, { [param.id]: next });
  } else {
    setMachineOperation(game, targeted, operation, {
      ...machine.selectedParameters,
      [param.id]: next,
    });
  }
}
