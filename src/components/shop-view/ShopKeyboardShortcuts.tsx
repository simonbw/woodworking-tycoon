import React, { useRef } from "react";
import {
  getMachines,
  hasFloorControls,
  isSameMachine,
} from "../../game/Machine";
import {
  dropMaterialAction,
  moveMaterialsToMachineAction,
  operateMachineAction,
  pickUpMaterialAction,
  setMachineOperationAction,
  setMachineSettingsAction,
  takeInputsFromMachineAction,
  takeOutputsFromMachineAction,
  toggleMachinePowerAction,
} from "../../game/game-actions/player-actions";
import {
  canPickUpMachine,
  pickUpCrateAction,
  pickUpMachineAction,
  putDownCarriedMachineAction,
  rotateCarriedMachineAction,
} from "../../game/game-actions/machine-actions";
import { toggleCarryShopVacAction } from "../../game/game-actions/shop-vac-actions";
import {
  pickUpBroomAction,
  putDownBroomAction,
} from "../../game/game-actions/dust-actions";
import { heldTool, holdingBroom } from "../../game/HeldTool";
import { atTruckBed } from "../../game/lot";
import { atStand, isSellable } from "../../game/stand";
import { handSpaceLeft } from "../../game/Person";
import {
  loadTruckBedAction,
  takeCrateFromTruckAction,
  takeFromTruckBedAction,
} from "../../game/game-actions/truck-actions";
import {
  setOutAtStandAction,
  takeFromStandAction,
} from "../../game/game-actions/stand-actions";
import { chebyshevDistance } from "../../game/Vectors";
import { materialSources, resolveInteract } from "../../game/interact";
import {
  findFeedableOperation,
  liveSettingParameter,
  parameterValueSatisfiable,
  slideStock,
  stageableMaterials,
} from "../../game/machine-helpers";

import { availableOperations } from "../../game/skill-helpers";
import { hasStationSheet } from "../station/station-helpers";
import { mod } from "../../utils/mathUtils";
import { useShortcut } from "../shortcuts/ShortcutProvider";
import { useTargetedMachine } from "../TargetedMachineContext";
import { playerMotion } from "../world-view/playerMotionStore";
import { useTruckStage } from "./truckStageStore";
import { useApplyGameAction, useGameState } from "../useGameState";

export const ShopKeyboardShortcuts: React.FC = () => {
  const applyAction = useApplyGameAction();
  const _gameState = useGameState();
  const gameState = useRef(_gameState);
  gameState.current = _gameState;

  const {
    machine: targetedMachine,
    cycleTarget,
    pileOffset,
    cyclePile,
    sheetMachine,
    toggleSheet,
    closeSheet,
    truckMenuOpen,
    openTruckMenu,
    closeTruckMenu,
  } = useTargetedMachine();
  const targeted = useRef(targetedMachine);
  targeted.current = targetedMachine;
  const truckMenuOpenRef = useRef(truckMenuOpen);
  truckMenuOpenRef.current = truckMenuOpen;
  const pileOffsetRef = useRef(pileOffset);
  pileOffsetRef.current = pileOffset;

  // While the player is off scavenging they aren't in the shop, and the
  // machine panels are hidden — the keys shouldn't still reach into them.
  // Same while the truck is still rolling in: they're in the cab.
  const truckStage = useTruckStage();
  const present = !_gameState.player.away && truckStage === "parked";
  // A machine over the shoulders means the hands are full: material and
  // machine verbs step aside until it's set down.
  const carrying = _gameState.player.carriedMachine != null;
  // A running station resolves its output against the plan and settings it
  // finds when it finishes, so the keys that would move either stand down
  // until the work is off the machine.
  const stationWorking =
    targetedMachine?.operationProgress.status === "inProgress";

  // The work keys — pick the plan (Q), dial it (Z/X/R), run it (Space).
  // A station worked from the floor answers them where it stands. A bench
  // doesn't: its work lives behind Tab, so out here the keys stand down
  // and only come back once the player has leaned in and the drawing and
  // the bench top are actually in front of them. Q and Z/X are the bench
  // view's own keys while it's open (BlueprintCorner draws their chips);
  // Space never returns at all — there is no held-Space path for hand
  // work, in the view or out of it (docs/bench-work.md).
  const leanedIn =
    sheetMachine != null &&
    targetedMachine != null &&
    isSameMachine(sheetMachine.state, targetedMachine.state);
  const floorControls =
    targetedMachine != null && hasFloorControls(targetedMachine.type);
  const settingKeysLive = floorControls || leanedIn;

  // Movement is deliberately absent here: walking is continuous (held
  // keys, not presses) and lives in HeldMovementListener + PlayerMotionLayer.

  useShortcut(
    "vac-toggle",
    () => applyAction(toggleCarryShopVacAction()),
    present && !carrying,
  );

  // Carry a machine: put down what's carried, else unpack the crate
  // underfoot, else hoist the machine the player is standing at (the
  // targeted one, so X picks between a table and what's mounted on it).
  useShortcut(
    "carry-machine",
    () => {
      const gs = gameState.current;
      if (gs.player.carriedMachine) {
        return applyAction(putDownCarriedMachineAction());
      }
      const crateUnderfoot = gs.machineCrates.some(
        (crate) => chebyshevDistance(crate.position, gs.player.position) <= 1,
      );
      if (crateUnderfoot) {
        return applyAction(pickUpCrateAction());
      }
      if (
        gs.truck.crates.length > 0 &&
        atTruckBed(gs.shopInfo, gs.player.position)
      ) {
        return applyAction(takeCrateFromTruckAction());
      }
      const machine = targeted.current;
      if (machine && canPickUpMachine(gs, machine.state)) {
        applyAction(pickUpMachineAction(machine.state));
      }
    },
    present,
  );

  useShortcut(
    "carry-rotate",
    () => applyAction(rotateCarriedMachineAction()),
    present && carrying,
  );

  // An open station sheet (or door card) claims Escape — the binding
  // steps aside otherwise; emptying the queue stays available while
  // away — it only affects what happens once the player is back.
  useShortcut(
    "close-sheet",
    () => {
      closeSheet();
      closeTruckMenu();
    },
    sheetMachine != null || truckMenuOpen,
  );

  useShortcut("cycle-machine", cycleTarget, present);

  // Enter spreads out (or folds up) the targeted station's sheet — the
  // full paperwork behind the on-machine hints.
  useShortcut(
    "open-station-sheet",
    toggleSheet,
    present &&
      !carrying &&
      (sheetMachine != null ||
        (targetedMachine != null && hasStationSheet(targetedMachine))),
  );

  // E is the interact key: take finished work, unload a bay, switch the
  // machine on, pick up the floor, head out the door — whichever the
  // shared resolver says applies here. The hint chip next to the player
  // shows the same answer, so the key never surprises.
  useShortcut(
    "pick-up",
    (event) => {
      const gs = gameState.current;
      if (truckMenuOpenRef.current) {
        return closeTruckMenu();
      }
      const action = resolveInteract(
        gs,
        targeted.current,
        pileOffsetRef.current,
      );
      if (!action) return;
      // Shift takes armfuls, and an armful is HAND_CAPACITY: the batch is
      // clamped to the room left so a big pile takes trips instead of the
      // action refusing the whole grab.
      const space = handSpaceLeft(gs.player);
      switch (action.kind) {
        case "take-outputs":
          return applyAction(
            takeOutputsFromMachineAction(
              event.shiftKey
                ? action.machine.outputMaterials.slice(0, space)
                : [action.machine.outputMaterials[0]],
              action.machine,
            ),
          );
        case "take-inputs":
          return applyAction(
            takeInputsFromMachineAction(
              event.shiftKey
                ? action.machine.inputMaterials.slice(0, space)
                : [action.machine.inputMaterials[0]],
              action.machine,
            ),
          );
        case "switch-on":
        case "switch-off":
          return applyAction(toggleMachinePowerAction(action.machine));
        case "pick-up-floor": {
          // Grab the piece R rummaged to (the top of the pile by default).
          // Shift's armful starts there too and wraps around the pile, so
          // a cycled-to piece is always in the batch.
          const piles = action.piles;
          const from = piles.indexOf(action.target);
          return applyAction(
            pickUpMaterialAction(
              event.shiftKey
                ? [...piles.slice(from), ...piles.slice(0, from)].slice(
                    0,
                    space,
                  )
                : [action.target],
            ),
          );
        }
        case "pick-up-broom":
          return applyAction(pickUpBroomAction());
        case "truck-bed": {
          const bed = gs.truck.bed;
          return applyAction(
            takeFromTruckBedAction(
              event.shiftKey ? bed.slice(-space) : [bed[bed.length - 1]],
            ),
          );
        }
        case "stand":
          return applyAction(takeFromStandAction(event.shiftKey ? space : 1));
        case "truck-cab":
          return openTruckMenu();
      }
    },
    present && !carrying,
  );

  // Put down: hand it to the targeted machine if it takes what we're
  // holding — onto a bench's bay, onto a saw's table — otherwise onto the
  // floor. Setting stock down is all this does; the trigger is Space.
  useShortcut(
    "put-down",
    (event) => {
      const gs = gameState.current;
      const inventory = gs.player.inventory;
      if (inventory.length === 0) {
        // Empty-handed except for the broom: F leans it right here
        if (holdingBroom(gs)) applyAction(putDownBroomAction());
        return;
      }

      // At the truck's bed, F loads over the rail instead of dropping
      if (atTruckBed(gs.shopInfo, gs.player.position)) {
        return applyAction(
          loadTruckBedAction(event.shiftKey ? inventory : [inventory[0]]),
        );
      }

      // At the for-sale stand, F sets sellable work out on the table
      if (atStand(gs.shopInfo, gs.player.position)) {
        const sellable = inventory.filter(isSellable);
        if (sellable.length > 0) {
          return applyAction(
            setOutAtStandAction(event.shiftKey ? sellable : [sellable[0]]),
          );
        }
      }

      const machine = targeted.current;
      if (machine && machine.operationProgress.status !== "inProgress") {
        const stageable = stageableMaterials(
          machine,
          inventory,
          gs.progression,
        );
        if (stageable.length > 0) {
          const staged = event.shiftKey ? stageable : [stageable[0]];
          applyAction(moveMaterialsToMachineAction(staged, machine));
          // A power-feed machine has no separate trigger: the rollers grab
          // the board the moment it touches them, so setting it down *is*
          // starting it. (Read from the post-stage state, since the
          // operation is inferred from what's now on the machine.)
          if (machine.type.directFeed) {
            applyAction((state) => {
              const restaged = getMachines(state.machines).find((m) =>
                isSameMachine(m.state, machine.state),
              );
              if (!restaged) return state;
              const match = findFeedableOperation(
                restaged,
                availableOperations(restaged, state.progression),
                restaged.inputMaterials,
              );
              return match?.operation.powerFeed === true
                ? operateMachineAction(restaged)(state)
                : state;
            });
          }
          return;
        }
      }

      // The piece lands at the body's actual position and keeps the
      // orientation it was carried in — the person sprite draws a
      // quarter turn off the heading, so the same offset lays the piece
      // down exactly as it looked in the arms.
      return applyAction(
        dropMaterialAction(
          event.shiftKey ? inventory : [inventory[0]],
          [...playerMotion.pos],
          playerMotion.heading + Math.PI / 2,
        ),
      );
    },
    present && !carrying,
  );

  useShortcut(
    "operate-machine",
    () => {
      // A tool in hand owns the hold: sweeping runs off the held flag in
      // tickAction, so the press mustn't also start the machine underfoot.
      if (heldTool(gameState.current) !== null) return;
      const machine = targeted.current;
      if (!machine) return;
      applyAction(operateMachineAction(machine));
    },
    // A bench has no trigger: hand work is performed in the bench view
    // and commits through its own actions, never through a held key.
    present && !carrying && floorControls,
  );

  // Q — the plan drawer — is the bench view's own key: BlueprintCorner
  // registers it (open-plan-browser), since the drawer's open state
  // lives there. Out on the floor the key does nothing.

  // Step one of the machine's settings — the keyboard equivalent of the
  // scales on its card. `kind` picks which: "linear" is the one Z and X
  // drive (the fence, the cutter head, the cut line), "rotate" is the one
  // R swings (the miter head). A machine carries at most one of each, so
  // neither key ever has to disambiguate.
  //
  // On direct-feed machines the setting can belong to any available
  // operation (what's in hand decides which one runs); at a bench only
  // the pulled plan's, and only with the drawing in front of you — the
  // scales are printed on it (BlueprintCorner), never on a floor chip.
  //
  // `coarse` is the shift modifier: it jumps the parameter's declared
  // coarseStep detents at once (a foot along the miter saw's inch marks)
  // instead of one, landing on the same marks a bare press walks through.
  const stepSetting = (
    kind: "linear" | "rotate",
    step: 1 | -1,
    coarse = false,
  ) => {
    const machine = targeted.current;
    if (!machine) return;

    const directFeed = machine.type.directFeed === true;
    const found = liveSettingParameter(
      machine,
      gameState.current.progression,
      kind,
    );
    if (!found) return;
    const { operation, parameter: param } = found;

    // Unset reads as the declared default — what the chip already shows —
    // so the first press steps off it instead of jumping to the scale's
    // first mark (unrecognised still lands at -1, stepping to the first).
    const current =
      machine.selectedParameters?.[param.id] ?? param.defaultValue;
    const currentIndex =
      current === undefined ? -1 : param.values.indexOf(current);
    const detents = coarse ? (param.coarseStep ?? 1) : 1;
    let next =
      param.values[mod(currentIndex + step * detents, param.values.length)];

    // A slide param moves the stock itself, so the key steps between the
    // marks the stock can actually reach — a 4' board slides among its own
    // foot marks, not the whole table's.
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
      applyAction(setMachineSettingsAction(machine, { [param.id]: next }));
    } else {
      applyAction(
        setMachineOperationAction(machine, operation, {
          ...machine.selectedParameters,
          [param.id]: next,
        }),
      );
    }
  };

  useShortcut(
    "setting-down",
    (event) => stepSetting("linear", -1, event.shiftKey),
    present && !stationWorking && settingKeysLive,
  );
  useShortcut(
    "setting-up",
    (event) => stepSetting("linear", 1, event.shiftKey),
    present && !stationWorking && settingKeysLive,
  );
  // R is claimed by whichever of its three bindings applies: the carried
  // machine while one rides the shoulders, the head of a machine with a
  // rotate setting to swing, and otherwise rummaging the pile underfoot.
  // The enabled conditions keep the three mutually exclusive — and since
  // a bench's head is never live out on the floor, R there is always the
  // pile.
  const rotateSettingLive =
    targetedMachine != null &&
    settingKeysLive &&
    liveSettingParameter(targetedMachine, _gameState.progression, "rotate") !=
      null;
  const interactNow =
    present && !carrying
      ? resolveInteract(_gameState, targetedMachine, pileOffset)
      : null;
  // R rummages whenever E is taking material and there's more than one
  // source within reach — a loaded machine's stock and the floor's pieces
  // form one ring, so a bench never hides the board lying beside it.
  const rummageLive =
    interactNow?.kind === "take-outputs" ||
    interactNow?.kind === "take-inputs" ||
    interactNow?.kind === "pick-up-floor";
  const sourceCount = rummageLive
    ? materialSources(_gameState, targetedMachine).length
    : 0;

  useShortcut(
    "rotate-setting",
    (event) => stepSetting("rotate", event.shiftKey ? -1 : 1),
    present && !carrying && !stationWorking && rotateSettingLive,
  );

  useShortcut(
    "cycle-pile",
    (event) => cyclePile(event.shiftKey ? -1 : 1),
    present && !carrying && sourceCount > 1 && !rotateSettingLive,
  );

  return null;
};
