import { Persistence } from "../config/constants";
import { BaseEntity } from "../core/entity/BaseEntity";
import { Entity } from "../core/entity/Entity";
import { on } from "../core/entity/handler";
import { clampsInUse } from "../game/Clamp";
import { machineKey, MachineState } from "../game/Machine";
import { vectorKey } from "../game/Vectors";
import { MachineCrateEntity } from "../sim/entities/MachineCrateEntity";
import { MachineEntity } from "../sim/entities/MachineEntity";
import { MaterialPileEntity } from "../sim/entities/MaterialPileEntity";
import { Player } from "../sim/entities/Player";
import { ShopVacEntity } from "../sim/entities/ShopVacEntity";
import { StandEntity } from "../sim/entities/StandEntity";
import { TruckEntity } from "../sim/entities/TruckEntity";
import { Broom } from "../sim/singletons/Broom";
import { Clock } from "../sim/singletons/Clock";
import { Consumables } from "../sim/singletons/Consumables";
import { Progression } from "../sim/singletons/Progression";
import { Reputation } from "../sim/singletons/Reputation";
import { TutorialTracker } from "../sim/singletons/TutorialTracker";
import { Wallet } from "../sim/singletons/Wallet";
import { TargetingState } from "./dispatch/TargetingState";

/**
 * The DOM layer's state-change signal (migration decision 8: ReactEntity
 * with autoRender=false, render on signals).
 *
 * The sim mutates imperatively, so nothing tells React "something
 * changed" for free. Each engine tick this entity folds the HUD-visible
 * surface — money, reputation, the clock, the hands, targeting, machine
 * states — into a cheap signature, and bumps a version when it moves.
 * React roots subscribe via `useSyncExternalStore`; a version bump is
 * one root render, and a quiet frame is zero.
 */
export class ShellStore extends BaseEntity implements Entity {
  id = "shellStore";
  persistenceLevel: number = Persistence.Permanent;
  pausable = false;

  private listeners = new Set<() => void>();
  version = 0;
  private lastSignature = "";

  /**
   * Whether a DOM modal claims the keyboard. Mirrored from the
   * ShortcutProvider's modal scope (ModalScopeBridge) so the engine's
   * input entities — ShortcutDispatcher, MovementInput, MousePicking —
   * can stand down while a dialog is up, the way the old shell's
   * modal-scoped dispatch kept floor keys out of open overlays.
   */
  modalOpen = false;

  setModalOpen(open: boolean): void {
    if (open === this.modalOpen) return;
    this.modalOpen = open;
    this.bump();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getVersion = (): number => this.version;

  /** Force a render (shell-side state the signature can't see). */
  bump(): void {
    this.version += 1;
    for (const listener of this.listeners) {
      listener();
    }
  }

  @on("afterTick")
  onAfterTick() {
    const signature = this.signature();
    if (signature !== this.lastSignature) {
      this.lastSignature = signature;
      this.bump();
    }
  }

  private signature(): string {
    const game = this.game;
    const player = game.entities.tryGetSingleton(Player);
    if (!player) return "empty";
    const clock = game.entities.tryGetSingleton(Clock);
    const wallet = game.entities.tryGetSingleton(Wallet);
    const reputation = game.entities.tryGetSingleton(Reputation);
    const consumables = game.entities.tryGetSingleton(Consumables);
    const progression = game.entities.tryGetSingleton(Progression);
    const tutorials = game.entities.tryGetSingleton(TutorialTracker);
    const targeting = game.entities.tryGetSingleton(TargetingState);
    const broom = game.entities.tryGetSingleton(Broom);
    const shopVac = game.entities.tryGetSingleton(ShopVacEntity);
    const stand = game.entities.tryGetSingleton(StandEntity);
    const truck = game.entities.tryGetSingleton(TruckEntity);

    const machines: string[] = [];
    const machineStates: MachineState[] = [];
    for (const machine of game.entities.byConstructor(MachineEntity)) {
      // Object identity is the change signal: entity code replaces the
      // state object on every mutation (the commands' contract).
      machines.push(machineKey(machine.state));
      machineStates.push(machine.state);
    }
    const pileCount = [...game.entities.byConstructor(MaterialPileEntity)]
      .length;
    const crateCount = [...game.entities.byConstructor(MachineCrateEntity)]
      .length;

    return [
      clock?.tick,
      clock?.day,
      wallet?.money,
      reputation?.reputation,
      player.inventory.length,
      player.inventory[player.inventory.length - 1]?.id,
      player.carriedMachine?.machineTypeId,
      player.away?.kind ?? "",
      player.busyTicks > 0 ? "busy" : "",
      // The interaction UI reads reach and facing off the projection, so
      // crossing a cell line or turning must re-render the chips.
      vectorKey(player.cell),
      player.direction,
      player.operating,
      player.waiting,
      broom ? `${broom.owned},${JSON.stringify(broom.position)}` : "",
      shopVac ? JSON.stringify(shopVac.position) : "no-vac",
      stand?.pieces.length,
      truck ? `${truck.bed.length},${truck.crates.length}` : "",
      pileCount,
      crateCount,
      consumables ? JSON.stringify(consumables.stock) : "",
      consumables?.clamps,
      // The supplies panel's rack count: clamps tied up in glue-ups
      clampsInUse(machineStates),
      // The hands strip's tool chips: broom in hand + dustpan fill,
      // vac hose in hand + canister fill
      broom
        ? [
            broom.owned,
            broom.position?.join(",") ?? "hand",
            JSON.stringify(broom.dustpan),
          ].join("/")
        : "",
      shopVac
        ? [
            shopVac.position?.join(",") ?? "hand",
            JSON.stringify(shopVac.canister),
          ].join("/")
        : "",
      progression?.xp,
      progression?.skillPoints,
      progression?.storeUnlocked,
      progression?.unlockedArticles.length,
      progression?.readArticles.length,
      tutorials ? JSON.stringify(tutorials.tutorials) : "",
      targeting
        ? [
            targeting.targeted()?.state.machineTypeId ?? "",
            targeting.sheetMachine()?.state.machineTypeId ?? "",
            targeting.truckMenuOpen,
            targeting.floorSheetOpen,
            targeting.pileOffset,
          ].join(",")
        : "",
      machines.join("|"),
    ].join("§");
  }
}
