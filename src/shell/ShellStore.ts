import { Persistence } from "../config/constants";
import { BaseEntity } from "../core/entity/BaseEntity";
import { Entity } from "../core/entity/Entity";
import { on } from "../core/entity/handler";
import { vectorKey } from "../game/Vectors";
import { Player } from "../sim/entities/Player";
import { Clock } from "../sim/singletons/Clock";
import { TargetingState } from "./dispatch/TargetingState";

/**
 * The DOM layer's state-change signal (migration decision 8: ReactEntity
 * with autoRender=false, render on signals).
 *
 * The sim mutates imperatively, so nothing tells React "something
 * changed" for free — but every discrete mutation announces itself as a
 * domain event (issue #230, phase 1), so this entity listens rather than
 * diffing: any event marks a render pending, and the end of the tick
 * delivers at most one bump. The only state still checked by value each
 * tick is the continuous kind no event covers — the clock's minutes, the
 * body's cell and facing, the held keys, the shopper's walk — folded
 * into a signature of a dozen primitives (the old signature stringified
 * the whole HUD surface, machines and piles included, every tick).
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
  /** An event landed since the last render signal. */
  private pendingBump = true;

  /**
   * Whether a DOM modal claims the keyboard. Mirrored from the
   * ShortcutProvider's modal scope (ModalScopeBridge) so the engine's
   * input entities — ShortcutDispatcher, MovementInput, MousePicking —
   * can stand down while a dialog is up, keeping floor keys out of
   * open overlays.
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

  // Every domain event is a render-worthy fact; the payload doesn't
  // matter here, only that something the DOM might show moved.
  @on("machineAdded")
  onMachineAdded() {
    this.pendingBump = true;
  }
  @on("machineRemoved")
  onMachineRemoved() {
    this.pendingBump = true;
  }
  @on("machineStateChanged")
  onMachineStateChanged() {
    this.pendingBump = true;
  }
  @on("pilesChanged")
  onPilesChanged() {
    this.pendingBump = true;
  }
  @on("cratesChanged")
  onCratesChanged() {
    this.pendingBump = true;
  }
  @on("playerChanged")
  onPlayerChanged() {
    this.pendingBump = true;
  }
  @on("truckChanged")
  onTruckChanged() {
    this.pendingBump = true;
  }
  @on("standChanged")
  onStandChanged() {
    this.pendingBump = true;
  }
  @on("suppliesChanged")
  onSuppliesChanged() {
    this.pendingBump = true;
  }
  @on("cleaningChanged")
  onCleaningChanged() {
    this.pendingBump = true;
  }
  @on("progressionChanged")
  onProgressionChanged() {
    this.pendingBump = true;
  }
  @on("worldLoaded")
  onWorldLoaded() {
    this.pendingBump = true;
  }

  @on("afterTick")
  onAfterTick() {
    const signature = this.signature();
    if (this.pendingBump || signature !== this.lastSignature) {
      this.pendingBump = false;
      this.lastSignature = signature;
      this.bump();
    }
  }

  /** The continuous state no event covers, as a handful of primitives. */
  private signature(): string {
    const game = this.game;
    const player = game.entities.tryGetSingleton(Player);
    if (!player) return "empty";
    const clock = game.entities.tryGetSingleton(Clock);
    const targeting = game.entities.tryGetSingleton(TargetingState);
    return [
      clock?.tick,
      clock?.day,
      // The interaction UI reads reach and facing off the projection, so
      // crossing a cell line or turning must re-render the chips.
      vectorKey(player.cell),
      player.direction,
      player.operating,
      player.waiting,
      player.busyTicks > 0 ? "busy" : "",
      // The shopper's walk through the aisles is continuous motion (see
      // trip-commands.setShoppingPosition); the shelf prompts follow it.
      player.away?.kind === "shopping"
        ? `${vectorKey(player.away.position)},${player.away.direction}`
        : "",
      targeting
        ? [
            targeting.targeted()?.state.machineTypeId ?? "",
            targeting.sheetMachine()?.state.machineTypeId ?? "",
            targeting.truckMenuOpen,
            targeting.floorSheetOpen,
            targeting.pileOffset,
          ].join(",")
        : "",
    ].join("§");
  }
}
