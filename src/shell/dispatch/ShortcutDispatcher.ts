import { Persistence } from "../../config/constants";
import { BaseEntity } from "../../core/entity/BaseEntity";
import { Entity } from "../../core/entity/Entity";
import { on } from "../../core/entity/handler";
import { GameEventMap } from "../../core/entity/Entity";
import { heldTool } from "../../game/HeldTool";
import { materialSources, resolveInteract } from "../../game/interact";
import { hasFloorControls } from "../../game/Machine";
import { divesToBench } from "../../components/station/station-helpers";
import { liveSettingParameter } from "../../game/machine-helpers";
import { ShortcutDef, ShortcutId, SHORTCUTS } from "../../game/shortcuts";
import { hasStationSheet } from "../../components/station/station-helpers";
import {
  carryMachineToggle,
  interactFacts,
  interactHere,
  operateTargeted,
  putDownHere,
  stepMachineSetting,
} from "../../sim/commands/interact-commands";
import {
  rotateCarriedMachine,
  shopCellMap,
} from "../../sim/commands/machine-commands";
import {
  cleaningGear,
  toggleCarryShopVac,
} from "../../sim/commands/cleaning-commands";
import { setOperating, setWaiting } from "../../sim/commands/player-commands";
import { canLeaveShopNow } from "../../sim/commands/trip-commands";
import { MachineEntity } from "../../sim/entities/MachineEntity";
import { Player } from "../../sim/entities/Player";
import { projectProgression } from "../../sim/projection";
import { activatesFocusedControl, isEditable } from "../../utils/keyboardFocus";
import { BenchDive } from "../scenes/bench/BenchDive";
import { StoreSceneRoot } from "../scenes/StoreSceneRoot";
import { TripTheater } from "../scenes/TripTheater";
import { ShellStore } from "../ShellStore";
import { TargetingState } from "./TargetingState";

/**
 * Take the key out of circulation.
 *
 * Two dispatchers share the document's keydown: this one for the floor
 * and the DOM's ShortcutProvider for the chrome. The engine's listener
 * is installed first (Game.init runs before React mounts), so stopping
 * propagation here is what keeps a key the world just used from also
 * reaching the chrome — Escape standing up from a bench must not pop
 * the pause menu behind it.
 */
function consume(event: KeyboardEvent): void {
  event.preventDefault();
  event.stopImmediatePropagation();
}

/**
 * The keys the bench dive leaves live. Leaned over a bench the dive owns
 * the keyboard, but the settings on the pulled drawing are still dialed
 * from out here — the paper strip's chips name Z, X and R, and a chip
 * names a live key (docs/floor-interaction.md).
 */
const BENCH_DIVE_SHORTCUTS: ReadonlySet<ShortcutId> = new Set([
  "setting-down",
  "setting-up",
  "rotate-setting",
]);

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

  /**
   * The machine a key acts on: the bench being leaned over while a dive
   * is open, otherwise the one the body is standing at. Leaned in, the
   * bench in front of the player is the only thing the keys can mean,
   * and the body is parked in its working stance anyway.
   */
  private activeTarget(): MachineEntity | null {
    const bench = this.game.entities.tryGetSingleton(BenchDive)?.openBench();
    return bench ?? this.targeting().targeted();
  }

  @on("keyDown")
  onKeyDown({ key, event }: GameEventMap["keyDown"]) {
    // The browser's keys stay the browser's. A shortcut with a modifier
    // on it is a page command (Cmd+R reloads, Cmd+F finds), a press in a
    // text field is typing, and Space, Enter and Tab belong to whatever
    // control holds focus — the chrome sits over the floor, so a press
    // aimed at a button must not also feed the machine underfoot. The
    // DOM's ShortcutProvider asks the same questions of the same
    // helpers; this listener runs first, so it has to ask them too.
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    // Escape still has to work from inside a field, so you can back out
    // of whatever put you there.
    if (isEditable(event.target) && key !== "Escape") return;
    if (activatesFocusedControl({ code: key, target: event.target })) return;

    // An open dialog owns the keyboard (the old modal scope): no floor
    // key fires and no hold starts. Key *releases* still land below, so
    // a hold begun before the dialog opened can't stick.
    if (this.game.entities.tryGetSingleton(ShellStore)?.modalOpen) return;

    // Leaned over a bench, the dive owns the keys: Tab or Escape stands
    // back up, and Z/X/R still dial the drawing's settings; the rest of
    // the floor's verbs wait until then. (The dive's own gesture
    // surfaces run on the pointer, not here.)
    const dive = this.game.entities.tryGetSingleton(BenchDive);
    if (dive?.openBenchKey != null) {
      // Whatever the hands picked up off the rail — a tool, a clamp,
      // the glue bottle — goes back where it came from before Escape
      // means standing up. Tab always steps back.
      if (key === "Escape" && dive.handsFull()) {
        dive.hold(null);
        consume(event);
        return;
      }
      if (key === "Tab" || key === "Escape") {
        dive.close();
        consume(event);
        return;
      }
      this.dispatchKey(key, event, BENCH_DIVE_SHORTCUTS);
      return;
    }

    // The walkable store's keys, mirroring the shop's: E takes things —
    // a flatbed from the corral, one off the shelf, the register, the
    // way home — F puts one back, Escape folds the receipt card. The
    // old StoreKeyboardShortcuts read the same resolver the chips draw
    // from; here the StoreSceneRoot owns both. The shop branch below is
    // naturally quiet for the whole trip (`present` guards on `away`).
    const storeScene = this.game.entities.tryGetSingleton(StoreSceneRoot);
    if (storeScene) {
      // The receipt card owns the keys while it's open (its own DOM
      // Escape handler folds it; nothing else may fire behind it).
      if (storeScene.checkoutOpen) return;
      if (key === "KeyE") {
        storeScene.pressE();
        consume(event);
        return;
      }
      if (key === "KeyF") {
        storeScene.pressF();
        consume(event);
        return;
      }
      if (key === "Escape" && storeScene.pressEscape()) {
        consume(event);
        return;
      }
      return;
    }

    // Held keys first — they're state, not shortcuts. Claiming the key
    // here matters even when no shortcut fires below: Space's default is
    // to scroll the page, and the shop would slide out from under the
    // player every time they held it at a machine that isn't running.
    if (key === "Space") {
      setOperating(this.game, true);
      event.preventDefault();
    }
    if (key === "KeyT") setWaiting(this.game, true);

    this.dispatchKey(key, event);
  }

  /**
   * Fire the first shortcut on this key that's in scope and enabled.
   * `only` narrows the field to a named set — the bench dive's Z/X/R.
   */
  private dispatchKey(
    key: string,
    event: KeyboardEvent,
    only?: ReadonlySet<ShortcutId>,
  ): void {
    const defs = this.byCode.get(key);
    if (!defs) return;
    for (const def of defs) {
      if (only && !only.has(def.id)) continue;
      if (def.requiresShift && !event.shiftKey) continue;
      if (def.scope !== "home" && def.scope !== "global") continue;
      if (!this.enabled(def.id)) continue;
      this.fire(def.id, event.shiftKey);
      consume(event);
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
    const player = game.entities.tryGetSingleton(Player);
    if (!player) return false;
    const progression = projectProgression(game);
    const targeting = this.targeting();
    const targeted = this.activeTarget();
    const targetedView = targeted?.view();

    // On the shop floor and able to act: back from a trip, and the
    // truck parked rather than still rolling up the driveway (the
    // player is inside it until then).
    const present =
      !player.away &&
      (game.entities.tryGetSingleton(TripTheater)?.stage() ?? "parked") ===
        "parked";
    const carrying = player.carriedMachine != null;
    const stationWorking =
      targetedView?.operationProgress.status === "inProgress";
    const sheetMachine = targeting.sheetMachine();
    // Leaned in means the drawing and the bench top are in front of the
    // player: either the station sheet is open on this machine, or the
    // bench dive is.
    const divedBench = this.game.entities
      .tryGetSingleton(BenchDive)
      ?.openBench();
    const leanedIn =
      (sheetMachine != null && sheetMachine === targeted) ||
      (divedBench != null && divedBench === targeted);
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
        // The open trip card owns E while its rows can run: the card's
        // own panel-accept takes the row the cursor is on, and this key
        // has to stay out of its way — a fired shortcut is a consumed
        // key, and the DOM listener runs after this one. With full hands
        // nothing on the card can run, so E is the interact key again
        // and folds the card (below).
        if (targeting.truckMenuOpen && canLeaveShopNow(game)) return false;
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
          liveSettingParameter(targetedView, progression, "rotate") != null
        );
      case "cycle-pile": {
        if (!(present && !carrying)) return false;
        const rotateLive =
          targetedView != null &&
          settingKeysLive &&
          !stationWorking &&
          liveSettingParameter(targetedView, progression, "rotate") != null;
        if (rotateLive) return false;
        const facts = interactFacts(game);
        const interactNow = resolveInteract(
          facts,
          shopCellMap(game),
          targetedView,
          targeting.pileOffset,
        );
        const rummageLive =
          interactNow?.kind === "take-outputs" ||
          interactNow?.kind === "take-inputs" ||
          interactNow?.kind === "pick-up-floor";
        return (
          rummageLive &&
          materialSources(facts, shopCellMap(game), targetedView).length > 1
        );
      }
      default:
        return false;
    }
  }

  /** Route a fired shortcut to its command. */
  private fire(id: ShortcutId, shift: boolean): void {
    const game = this.game;
    const targeting = this.targeting();
    const targeted = this.activeTarget();

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
      case "open-station-sheet": {
        // Tab at a bench dives into the work surface instead of a sheet
        // (decision 1 in docs/bench-work.md: the bench view is the one
        // player path to hand work). A container bench — a garbage can,
        // a rack — has no work surface, so it keeps its sheet.
        const view = targeted?.view();
        if (view && divesToBench(view, projectProgression(game))) {
          this.game.entities.tryGetSingleton(BenchDive)?.open(targeted!);
          return;
        }
        targeting.toggleSheet();
        return;
      }
      case "pick-up": {
        if (targeting.truckMenuOpen) {
          // Only reached with the card's rows dead (see `enabled`): the
          // press folds the card instead.
          targeting.closeTruckMenu();
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
        if (heldTool(cleaningGear(game)) !== null) return;
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
