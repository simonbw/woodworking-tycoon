import { Persistence } from "../../config/constants";
import { BaseEntity } from "../../core/entity/BaseEntity";
import { Entity } from "../../core/entity/Entity";
import { on } from "../../core/entity/handler";
import { GameEventMap } from "../../core/entity/Entity";
import { heldTool } from "../../game/HeldTool";
import { materialSources, resolveInteract } from "../../game/interact";
import { hasFloorControls } from "../../game/Machine";
import { liveSettingParameter } from "../../game/machine-helpers";
import { ShortcutDef, ShortcutId, SHORTCUTS } from "../../game/shortcuts";
import { hasStationSheet } from "../../components/station/station-helpers";
import {
  carryMachineToggle,
  interactHere,
  operateTargeted,
  putDownHere,
  stepMachineSetting,
} from "../../sim/commands/interact-commands";
import { rotateCarriedMachine } from "../../sim/commands/machine-commands";
import { toggleCarryShopVac } from "../../sim/commands/cleaning-commands";
import { setOperating, setWaiting } from "../../sim/commands/player-commands";
import { canLeaveShop } from "../../sim/commands/trip-commands";
import { Player } from "../../sim/entities/Player";
import { projectGameState } from "../../sim/projection";
import { ShellStore } from "../ShellStore";
import { TargetingState } from "./TargetingState";

/**
 * Keys to commands — the ShortcutDispatcher the migration plan calls
 * for. The registry (`src/game/shortcuts.ts`) stays the single source
 * of truth for bindings and scopes; this entity matches engine key
 * events against it and calls commands (the composite ones in
 * `interact-commands.ts` own each key's decision — no game logic lives
 * here, only enablement checks ported from the old
 * ShopKeyboardShortcuts guards).
 *
 * Held keys are key *state*, not presses: operate (Space) and wait (T)
 * set the player's held flags on keyDown/keyUp, exactly like the old
 * heldOperateInput listeners; held movement is MovementInput's.
 *
 * Scopes: "home" and "global" fire here; "modal" arrives with the
 * phase-5 overlay port, and until the HUD exists nothing opens a modal
 * from the shell.
 */
export class ShortcutDispatcher extends BaseEntity implements Entity {
  persistenceLevel: number = Persistence.Permanent;
  pausable = false;

  private byCode = new Map<string, ShortcutDef[]>();

  constructor() {
    super();
    for (const def of SHORTCUTS) {
      for (const code of def.codes) {
        const list = this.byCode.get(code) ?? [];
        list.push(def);
        this.byCode.set(code, list);
      }
    }
  }

  private targeting(): TargetingState {
    return this.game.entities.getSingleton(TargetingState);
  }

  @on("keyDown")
  onKeyDown({ key, event }: GameEventMap["keyDown"]) {
    // An open dialog owns the keyboard (the old modal scope): no floor
    // key fires and no hold starts. Key *releases* still land below, so
    // a hold begun before the dialog opened can't stick.
    if (this.game.entities.tryGetSingleton(ShellStore)?.modalOpen) return;

    // Held keys first — they're state, not shortcuts.
    if (key === "Space") setOperating(this.game, true);
    if (key === "KeyT") setWaiting(this.game, true);

    const defs = this.byCode.get(key);
    if (!defs) return;
    for (const def of defs) {
      if (def.requiresShift && !event.shiftKey) continue;
      if (def.scope !== "home" && def.scope !== "global") continue;
      if (!this.enabled(def.id)) continue;
      this.fire(def.id, event.shiftKey);
      event.preventDefault();
      return;
    }
  }

  @on("keyUp")
  onKeyUp({ key }: GameEventMap["keyUp"]) {
    if (key === "Space") setOperating(this.game, false);
    if (key === "KeyT") setWaiting(this.game, false);
  }

  /** The old component's `enabled` guards, per shortcut. */
  private enabled(id: ShortcutId): boolean {
    const game = this.game;
    if (!game.entities.tryGetSingleton(Player)) return false;
    const gs = projectGameState(game);
    const targeting = this.targeting();
    const targeted = targeting.targeted();
    const targetedView = targeted?.view();

    const present = !gs.player.away;
    const carrying = gs.player.carriedMachine != null;
    const stationWorking =
      targetedView?.operationProgress.status === "inProgress";
    const sheetMachine = targeting.sheetMachine();
    const leanedIn = sheetMachine != null && sheetMachine === targeted;
    const floorControls =
      targetedView != null && hasFloorControls(targetedView.type);
    const settingKeysLive = floorControls || leanedIn;

    switch (id) {
      case "vac-toggle":
        return present && !carrying;
      case "carry-machine":
        return present;
      case "carry-rotate":
        return present && carrying;
      case "close-sheet":
        return (
          sheetMachine != null ||
          targeting.truckMenuOpen ||
          targeting.floorSheetOpen
        );
      case "cycle-machine":
        return present;
      case "open-station-sheet":
        return (
          present &&
          !carrying &&
          (sheetMachine != null ||
            (targetedView != null && hasStationSheet(targetedView)))
        );
      case "pick-up":
        return present && !carrying;
      case "put-down":
        return present && !carrying;
      case "operate-machine":
        return present && !carrying && floorControls;
      case "wait":
        return present;
      case "setting-down":
      case "setting-up":
        return present && !stationWorking && settingKeysLive;
      case "rotate-setting":
        return (
          present &&
          !carrying &&
          !stationWorking &&
          targetedView != null &&
          settingKeysLive &&
          liveSettingParameter(targetedView, gs.progression, "rotate") != null
        );
      case "cycle-pile": {
        if (!(present && !carrying)) return false;
        const rotateLive =
          targetedView != null &&
          settingKeysLive &&
          !stationWorking &&
          liveSettingParameter(targetedView, gs.progression, "rotate") != null;
        if (rotateLive) return false;
        const interactNow = resolveInteract(
          gs,
          targetedView,
          targeting.pileOffset,
        );
        const rummageLive =
          interactNow?.kind === "take-outputs" ||
          interactNow?.kind === "take-inputs" ||
          interactNow?.kind === "pick-up-floor";
        return rummageLive && materialSources(gs, targetedView).length > 1;
      }
      default:
        return false;
    }
  }

  /** Route a fired shortcut to its command. */
  private fire(id: ShortcutId, shift: boolean): void {
    const game = this.game;
    const targeting = this.targeting();
    const targeted = targeting.targeted();

    switch (id) {
      case "vac-toggle":
        toggleCarryShopVac(game);
        return;
      case "carry-machine":
        carryMachineToggle(game, targeted);
        return;
      case "carry-rotate":
        rotateCarriedMachine(game);
        return;
      case "close-sheet":
        // Escape backs out one layer at a time: the floor's card is the
        // innermost surface whenever it's open (the old FloorSheet bound
        // the key ahead of the station sheet's own binding).
        if (targeting.floorSheetOpen) {
          targeting.closeFloorSheet();
          return;
        }
        targeting.closeSheet();
        targeting.closeTruckMenu();
        return;
      case "cycle-machine":
        targeting.cycleTarget();
        return;
      case "open-station-sheet":
        targeting.toggleSheet();
        return;
      case "pick-up": {
        if (targeting.truckMenuOpen) {
          // The open trip card owns E while its rows can run — the DOM
          // card's panel-accept takes the row the cursor is on (the old
          // registry order). With full hands nothing on the card can
          // run, so the press falls through here and folds the card.
          if (!canLeaveShop(projectGameState(game))) {
            targeting.closeTruckMenu();
          }
          return;
        }
        const outcome = interactHere(
          game,
          targeted,
          targeting.pileOffset,
          shift,
        );
        if (outcome === "truck-cab") targeting.openTruckMenu();
        return;
      }
      case "put-down":
        putDownHere(game, targeted, shift);
        return;
      case "operate-machine": {
        // A tool in hand owns the hold: the press mustn't also start the
        // machine underfoot (the held flag is already set).
        if (heldTool(projectGameState(game)) !== null) return;
        operateTargeted(game, targeted);
        return;
      }
      case "wait":
        // Held state only — set on keyDown above.
        return;
      case "setting-down":
        stepMachineSetting(game, targeted, "linear", -1, shift);
        return;
      case "setting-up":
        stepMachineSetting(game, targeted, "linear", 1, shift);
        return;
      case "rotate-setting":
        stepMachineSetting(game, targeted, "rotate", shift ? -1 : 1);
        return;
      case "cycle-pile":
        targeting.cyclePile(shift ? -1 : 1);
        return;
      default:
        return;
    }
  }
}
