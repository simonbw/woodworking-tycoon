import { Constructor } from "../../core/EntityList";
import { Entity } from "../../core/entity/Entity";
import { Game } from "../../core/Game";
import { mulberry32 } from "../../core/util/SeededRandom";
import { GameState } from "../../game/GameState";
import { MachineId, ParameterValues } from "../../game/Machine";
import { MaterialInstance } from "../../game/Materials";
import { cellCenter } from "../../game/player-motion";
import { atStand, isSellable, standRect } from "../../game/stand";
import { Vector } from "../../game/Vectors";
import { bootShop } from "../bootstrap";
import {
  moveMaterialsToMachine,
  operateMachine,
  setMachineOperation,
  setMachineSettings,
  takeOutputsFromMachine,
  toggleMachinePower,
} from "../commands/machine-commands";
import { setOperating } from "../commands/player-commands";
import { setOutAtStand } from "../commands/stand-commands";
import { MachineEntity } from "../entities/MachineEntity";
import { Player } from "../entities/Player";
import { StandEntity } from "../entities/StandEntity";
import { loadGameState } from "../save/fixture";
import { SaveFile, serializeGame } from "../save/SaveFile";
import { Clock } from "../singletons/Clock";
import { Consumables } from "../singletons/Consumables";
import { Progression } from "../singletons/Progression";
import { Reputation } from "../singletons/Reputation";
import { ShopInfo } from "../singletons/ShopInfo";
import { StorageUpgrades } from "../singletons/StorageUpgrades";
import { TutorialTracker } from "../singletons/TutorialTracker";
import { Wallet } from "../singletons/Wallet";
import { TimeFlow } from "../TimeFlow";

/**
 * The sequence tier's harness for the entity world: a headless, seeded
 * Game booted from a fresh shop or a fixture save, advanced
 * synchronously, and inspected through its entities.
 *
 * This is the successor of `src/game/sequences/shop-driver.ts`. As phase
 * 2 of MIGRATION.md ports each system, this driver grows the same
 * job-level verbs the old one has (walkTo, mill, sellAtStand, …), each
 * implemented as calls into the command layer — the same surface the
 * input dispatcher uses, so a green sequence test vouches for what a
 * player can actually reach. Mutating the world any other way from a
 * test defeats that; the import-boundary test holds this file to the
 * command surface (plus read-only singleton access for assertions).
 */
export class ShopDriver {
  readonly game: Game;

  constructor({
    seed = 1,
    save,
    state,
  }: { seed?: number; save?: SaveFile; state?: GameState } = {}) {
    this.game = new Game({ headless: true, random: mulberry32(seed) });
    bootShop(this.game, save);
    if (state) {
      loadGameState(this.game, state);
    }
  }

  /**
   * Advance the world by whole game minutes — the old tickAction unit,
   * which is what every sequence test thinks in. Each minute is forced
   * through TimeFlow one engine tick at a time so the per-minute
   * interleaving of the sim layers matches the old pipeline exactly.
   */
  tick(ticks: number = 1): void {
    for (let i = 0; i < ticks; i++) {
      this.timeFlow.forceMinutes(1);
      this.game.step(1);
    }
  }

  /**
   * Advance raw engine frames under the live pace model (movement and
   * real-time pacing tests; sim time accrues only as TimeFlow allows).
   */
  stepEngine(frames: number = 1): void {
    this.game.step(frames);
  }

  /** Snapshot the world as a save file. */
  save(): SaveFile {
    return serializeGame(this.game);
  }

  // ------------------------------------------------------------------
  // Assertion surface: read-only access to the world's singletons.
  // ------------------------------------------------------------------

  singleton<T extends Entity>(constructor: Constructor<T>): T {
    return this.game.entities.getSingleton(constructor);
  }

  get player(): Player {
    return this.singleton(Player);
  }

  get timeFlow(): TimeFlow {
    return this.singleton(TimeFlow);
  }

  get clock(): Clock {
    return this.singleton(Clock);
  }

  get wallet(): Wallet {
    return this.singleton(Wallet);
  }

  get reputation(): Reputation {
    return this.singleton(Reputation);
  }

  get consumables(): Consumables {
    return this.singleton(Consumables);
  }

  get storageUpgrades(): StorageUpgrades {
    return this.singleton(StorageUpgrades);
  }

  get shopInfo(): ShopInfo {
    return this.singleton(ShopInfo);
  }

  get progression(): Progression {
    return this.singleton(Progression);
  }

  get tutorials(): TutorialTracker {
    return this.singleton(TutorialTracker);
  }

  get stand(): StandEntity {
    return this.singleton(StandEntity);
  }

  // ------------------------------------------------------------------
  // Job-level verbs, each a call into the command layer (the same
  // surface the input dispatcher uses). Arrangement-style setup (stand
  // here, hold this) mirrors the old driver's teleporting verbs.
  // ------------------------------------------------------------------

  /** The one machine of this type on the floor. Throws on none or many. */
  machine(machineTypeId: MachineId): MachineEntity {
    const matches = [...this.game.entities.byConstructor(MachineEntity)].filter(
      (entity) => entity.state.machineTypeId === machineTypeId,
    );
    if (matches.length !== 1) {
      throw new Error(
        `Expected exactly one ${machineTypeId}, found ${matches.length}`,
      );
    }
    return matches[0];
  }

  /** Teleport the body to stand in a cell (arrangement, not walking). */
  standAt(position: Vector): this {
    this.player.position = cellCenter(position);
    return this;
  }

  /** Stand at a machine's operator cell, ready to work it. */
  standAtOperatorCell(machineTypeId: MachineId): this {
    const cell = this.machine(machineTypeId).view().absoluteOperationPosition;
    if (!cell) {
      throw new Error(`${machineTypeId} has no operator cell`);
    }
    return this.standAt(cell);
  }

  /** Make sure a machine's power switch is on. */
  switchOn(machineTypeId: MachineId): this {
    const entity = this.machine(machineTypeId);
    if (!entity.type.powerSwitch) {
      throw new Error(`${machineTypeId} has no power switch`);
    }
    if (!(entity.state.poweredOn ?? false)) {
      toggleMachinePower(this.game, entity);
    }
    return this;
  }

  /** Turn a machine's persistent settings (fence, stops, angle). */
  setSettings(machineTypeId: MachineId, settings: ParameterValues): this {
    setMachineSettings(this.game, this.machine(machineTypeId), settings);
    return this;
  }

  /** Select an operation on a machine by id. */
  select(
    machineTypeId: MachineId,
    operationId: string,
    parameters?: ParameterValues,
  ): this {
    const entity = this.machine(machineTypeId);
    const operation = entity
      .view()
      .operations.find((op) => op.id === operationId);
    if (!operation) {
      throw new Error(`${machineTypeId} has no operation ${operationId}`);
    }
    setMachineOperation(this.game, entity, operation, parameters);
    return this;
  }

  /**
   * Move matching materials from the player's hands onto a machine's
   * input bay.
   */
  load(
    machineTypeId: MachineId,
    predicate: (material: MaterialInstance) => boolean,
    count = 1,
  ): this {
    const materials = this.player.inventory.filter(predicate).slice(0, count);
    if (materials.length < count) {
      throw new Error("Not holding enough matching materials to load");
    }
    moveMaterialsToMachine(this.game, materials, this.machine(machineTypeId));
    return this;
  }

  /** Start the machine's operation (direct feed reads the staged stock). */
  operate(machineTypeId: MachineId): this {
    operateMachine(this.game, this.machine(machineTypeId));
    return this;
  }

  /** Press or release the operate key. */
  holdOperate(operating = true): this {
    setOperating(this.game, operating);
    return this;
  }

  /** Take everything out of a machine's output bay into the hands. */
  collect(machineTypeId: MachineId): this {
    const entity = this.machine(machineTypeId);
    takeOutputsFromMachine(
      this.game,
      [...entity.state.outputMaterials],
      entity,
    );
    return this;
  }

  // ------------------------------------------------------------------
  // The for-sale stand: the one selling channel, and where a sequence's
  // money and reputation come from.
  // ------------------------------------------------------------------

  /** A walkable cell within arm's reach of the stand's table. */
  standAtStand(): this {
    const rect = standRect(this.shopInfo.info);
    this.standAt([
      Math.floor((rect.min[0] + rect.max[0]) / 2),
      Math.floor(rect.min[1]) - 1,
    ]);
    if (!atStand(this.shopInfo.info, this.player.cell)) {
      throw new Error("standAtStand missed the table's reach — driver bug");
    }
    return this;
  }

  /**
   * Carry every piece in hand matching the predicate down the driveway
   * and set it out on the stand. (The old driver also swept the floor's
   * piles; those arrive with the piles port.)
   */
  setOut(
    predicate: (material: MaterialInstance) => boolean = isSellable,
  ): this {
    const materials = this.player.inventory.filter(predicate);
    if (materials.length === 0) {
      throw new Error(
        `Nothing in hand to set out — holding ` +
          `[${this.player.inventory.map((m) => m.type).join(", ")}]`,
      );
    }
    const before = this.stand.pieces.length;
    this.standAtStand();
    setOutAtStand(this.game, materials);
    if (this.stand.pieces.length !== before + materials.length) {
      throw new Error(
        `The stand would not take [${materials.map((m) => m.type).join(", ")}]`,
      );
    }
    return this;
  }

  /**
   * Let the street run until `count` more pieces have sold off the
   * stand. Sales roll from the game's seeded rng, so a sequence lands
   * the same buyers every run; the ceiling is generous enough that a
   * stocked stand can't miss it, and anything slower fails loudly.
   * (The old driver slept through nights as they came; sleeping arrives
   * with the day-cycle port, so this ticks straight through.)
   */
  awaitSales(count = 1): this {
    const target = this.progression.salesCompleted + count;
    for (
      let guard = 0;
      guard < 400 && this.progression.salesCompleted < target;
      guard++
    ) {
      this.tick(25);
    }
    if (this.progression.salesCompleted < target) {
      throw new Error(
        `Only ${count - (target - this.progression.salesCompleted)} ` +
          `of ${count} pieces sold — the stand holds ` +
          `[${this.stand.pieces.map((m) => m.type).join(", ")}]`,
      );
    }
    return this;
  }
}
