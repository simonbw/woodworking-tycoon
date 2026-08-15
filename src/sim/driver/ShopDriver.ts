import { Constructor } from "../../core/EntityList";
import { Entity } from "../../core/entity/Entity";
import { Game } from "../../core/Game";
import { mulberry32 } from "../../core/util/SeededRandom";
import { GameState } from "../../game/GameState";
import { isOutdoors, truckCabSideCell } from "../../game/lot";
import { MachineId, ParameterValues } from "../../game/Machine";
import { SkillId } from "../../game/Skill";
import { MaterialInstance } from "../../game/Materials";
import { HAND_CAPACITY } from "../../game/Person";
import { cellCenter, motionCell } from "../../game/player-motion";
import { atStand, isSellable, standRect } from "../../game/stand";
import { Vector } from "../../game/Vectors";
import { bootShop } from "../bootstrap";
import {
  buyBroom,
  buyShopVac,
  pickUpBroom,
  putDownBroom,
  toggleCarryShopVac,
} from "../commands/cleaning-commands";
import {
  moveMaterialsToMachine,
  operateMachine,
  setMachineOperation,
  setMachineSettings,
  takeOutputsFromMachine,
  toggleMachinePower,
} from "../commands/machine-commands";
import { dropMaterial, pickUpMaterial } from "../commands/pile-commands";
import { setOperating, setSweepAim } from "../commands/player-commands";
import { spendSkillPoint } from "../commands/progression-commands";
import { setOutAtStand } from "../commands/stand-commands";
import { loadTruckBed, takeFromTruckBed } from "../commands/truck-commands";
import { MachineEntity } from "../entities/MachineEntity";
import { MaterialPileEntity } from "../entities/MaterialPileEntity";
import { Player } from "../entities/Player";
import { ShopVacEntity } from "../entities/ShopVacEntity";
import { StandEntity } from "../entities/StandEntity";
import { TruckEntity } from "../entities/TruckEntity";
import { loadGameState } from "../save/fixture";
import { SaveFile, serializeGame } from "../save/SaveFile";
import { Broom } from "../singletons/Broom";
import { Clock } from "../singletons/Clock";
import { Consumables } from "../singletons/Consumables";
import { DustLayer } from "../singletons/DustLayer";
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

/** Matches the stock a job wants out of wherever it's being taken from. */
type MaterialPredicate = (material: MaterialInstance) => boolean;

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

  get truck(): TruckEntity {
    return this.singleton(TruckEntity);
  }

  /** What the player's arms hold right now. */
  get inventory(): ReadonlyArray<MaterialInstance> {
    return this.player.inventory;
  }

  /** Every pile of loose stock on the shop floor, insertion order. */
  get piles(): ReadonlyArray<MaterialPileEntity> {
    return [...this.game.entities.byConstructor(MaterialPileEntity)];
  }

  /** Everything in hand that the predicate matches. */
  holding(predicate: MaterialPredicate): ReadonlyArray<MaterialInstance> {
    return this.inventory.filter(predicate);
  }

  /**
   * Everything within reach that the predicate matches — in the arms or
   * piled on the floor. The hands hold HAND_CAPACITY pieces, so a
   * chain's stock lives mostly on the floor between steps; what a test
   * usually wants to know is "does the shop have it", and this is that.
   */
  stock(predicate: MaterialPredicate): ReadonlyArray<MaterialInstance> {
    return [
      ...this.inventory.filter(predicate),
      ...this.piles.map((pile) => pile.material).filter(predicate),
    ];
  }

  /**
   * The one thing within reach (hand or floor) that matches, or a failure
   * naming what's there.
   */
  theOne(predicate: MaterialPredicate): MaterialInstance {
    const matches = this.stock(predicate);
    if (matches.length !== 1) {
      throw new Error(
        `Expected exactly one matching material in reach, found ${matches.length}` +
          ` among hand [${this.inventory.map((m) => m.type).join(", ")}] and ` +
          `floor [${this.piles.map((p) => p.material.type).join(", ")}]`,
      );
    }
    return matches[0];
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

  get dustLayer(): DustLayer {
    return this.singleton(DustLayer);
  }

  get broom(): Broom {
    return this.singleton(Broom);
  }

  /** The shop vac, or null while the shop doesn't own one. */
  get shopVac(): ShopVacEntity | null {
    return this.game.entities.tryGetSingleton(ShopVacEntity) ?? null;
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

  /**
   * Walk to a pile. Piles rest at continuous positions, not on cells —
   * standing in the cell under the piece's center is always within reach
   * (see pileWithinReach).
   */
  standNear(pile: MaterialPileEntity): this {
    return this.standAt(motionCell(pile.position));
  }

  /** Stand at the tailgate — the loading side of the parked truck. */
  standAtBed(): this {
    const [doorX] = this.shopInfo.info.entrancePosition;
    return this.standAt([doorX, this.shopInfo.info.size[1] + 1]);
  }

  /** Stand at the truck's cab, where trips start and work is driven off. */
  standAtCab(): this {
    return this.standAt(truckCabSideCell(this.shopInfo.info));
  }

  /**
   * Set everything down on the floor here. A crate takes both hands, so the
   * offcuts and leftovers a chain accumulates have to go somewhere before a
   * machine can be carried — and they stay on the floor to be picked up
   * again, the way they would in a real shop.
   */
  putEverythingDown(): this {
    if (this.inventory.length === 0) {
      return this;
    }
    // Piles live on floor cells; from out on the lot (the cab, the bed)
    // this walks in to the dropoff spot first.
    if (isOutdoors(this.shopInfo.info, this.player.cell)) {
      this.standAt(this.shopInfo.info.materialDropoffPosition);
    }
    const held = this.inventory.length;
    dropMaterial(this.game, [...this.inventory]);
    if (this.inventory.length === held) {
      throw new Error(`Couldn't set the carried stock down`);
    }
    return this;
  }

  /**
   * Pick a matching pile back up off the floor, into the arms. This
   * refuses an ask bigger than the arm room outright — take an armful
   * and set it down yourself.
   */
  takeFromFloor(predicate: MaterialPredicate, count?: number): this {
    const matches = this.piles.filter((pile) => predicate(pile.material));
    const wanted = count === undefined ? matches : matches.slice(0, count);
    if (wanted.length === 0) {
      throw new Error(
        `Nothing matching on the floor — the piles hold ` +
          `[${this.piles.map((p) => p.material.type).join(", ")}]`,
      );
    }
    if (wanted.length > this.player.handSpaceLeft) {
      throw new Error(
        `Wanted ${wanted.length} pieces off the floor with arm room for ` +
          `${this.player.handSpaceLeft} — the hands hold ${HAND_CAPACITY}`,
      );
    }
    // Piles can sit on different cells; take them one cell at a time.
    for (const pile of wanted) {
      this.standNear(pile);
      pickUpMaterial(this.game, [pile]);
    }
    return this;
  }

  /**
   * Ferry these materials — in hand or on the floor — into the truck's
   * bed at the tailgate, an armful at a time. With no argument it loads
   * what's in hand. The first half of every delivery.
   */
  loadBed(materials: ReadonlyArray<MaterialInstance> = this.inventory): this {
    const targets = new Set(materials);
    if (targets.size === 0) {
      return this;
    }
    while (true) {
      const inHand = this.inventory.filter((m) => targets.has(m));
      if (inHand.length > 0) {
        this.standAtBed();
        const before = this.truck.bed.length;
        loadTruckBed(this.game, inHand);
        if (this.truck.bed.length !== before + inHand.length) {
          throw new Error(`The bed would not take what's in hand`);
        }
        for (const m of inHand) {
          targets.delete(m);
        }
      }
      const piles = this.piles.filter((pile) => targets.has(pile.material));
      if (piles.length === 0) {
        break;
      }
      // Full of stock that isn't going: stage it on the dropoff spot so
      // the arms are free to ferry what is.
      if (this.player.handSpaceLeft === 0) {
        this.standAt(this.shopInfo.info.materialDropoffPosition);
        dropMaterial(this.game, [...this.inventory]);
      }
      for (const pile of piles.slice(0, this.player.handSpaceLeft)) {
        const held = this.inventory.length;
        this.standNear(pile);
        pickUpMaterial(this.game, [pile]);
        if (this.inventory.length === held) {
          throw new Error(
            `Couldn't pick ${pile.material.type} up to load the bed`,
          );
        }
      }
    }
    return this;
  }

  /**
   * Empty the truck's bed onto the material dropoff spot, an armful at a
   * time — the tailgate-to-floor trips the hand cap makes real. Ends
   * empty-handed, with the haul staged on the floor where `takeFromFloor`
   * will find it.
   */
  unloadBed(): this {
    if (this.truck.bed.length === 0) {
      return this;
    }
    const dropoff = this.shopInfo.info.materialDropoffPosition;
    while (this.truck.bed.length > 0) {
      if (this.player.handSpaceLeft === 0) {
        this.standAt(dropoff);
        dropMaterial(this.game, [...this.inventory]);
      }
      this.standAtBed();
      const before = this.truck.bed.length;
      takeFromTruckBed(
        this.game,
        this.truck.bed.slice(0, this.player.handSpaceLeft),
      );
      if (this.truck.bed.length === before) {
        throw new Error(
          `The bed would not unload — holding a tool, or too far from it`,
        );
      }
    }
    if (this.inventory.length > 0) {
      this.standAt(dropoff);
      dropMaterial(this.game, [...this.inventory]);
    }
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

  /** Spend a point in the journal. */
  learn(skillId: SkillId): this {
    const before = this.progression.unlockedSkills.length;
    spendSkillPoint(this.game, skillId);
    if (this.progression.unlockedSkills.length === before) {
      throw new Error(
        `Couldn't learn ${skillId} — ${this.progression.skillPoints} ` +
          `points unspent, and its prerequisites may not be met`,
      );
    }
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

  // ------------------------------------------------------------------
  // Cleaning verbs
  // ------------------------------------------------------------------

  /** Buy the broom; it arrives leaning at the material dropoff spot. */
  buyBroom(): this {
    buyBroom(this.game);
    return this;
  }

  /** Take the leaning broom (within reach) into the hands. */
  grabBroom(): this {
    pickUpBroom(this.game);
    return this;
  }

  /** Lean the held broom on the floor right here. */
  leanBroom(): this {
    putDownBroom(this.game);
    return this;
  }

  /** Buy the shop vac; it's delivered parked at the dropoff spot. */
  buyShopVac(): this {
    buyShopVac(this.game);
    return this;
  }

  /** Grab the vac's hose (standing by it) or park it right here. */
  toggleVacHose(): this {
    toggleCarryShopVac(this.game);
    return this;
  }

  /**
   * One held stroke of the tool in hand — a minute with the operate key
   * down, optionally with the broom aimed at a cell (the mouse steer),
   * then the key released. Works the broom or the vac's hose alike; at
   * the garbage can, the same hold pours the pan or canister out.
   */
  sweep(at?: Vector): this {
    setSweepAim(this.game, at ?? null);
    setOperating(this.game, true);
    this.tick(1);
    setOperating(this.game, false);
    setSweepAim(this.game, null);
    return this;
  }
}
