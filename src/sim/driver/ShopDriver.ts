import { Constructor } from "../../core/EntityList";
import { Entity } from "../../core/entity/Entity";
import { Game } from "../../core/Game";
import { mulberry32 } from "../../core/util/SeededRandom";
import { benchTopSizeIn } from "../../game/bench-work/bench-layout";
import { board } from "../../game/board-helpers";
import { ConsumableId } from "../../game/Consumable";
import { GameState } from "../../game/GameState";
import { isOutdoors, truckCabSideCell } from "../../game/lot";
import { LUMBER_CHANNELS, StoreId } from "../../game/lumberStock";
import { MachineId, ParameterValues } from "../../game/Machine";
import { makeMaterial } from "../../game/material-helpers";
import { getBoardBuyPrice, getSheetBuyPrice } from "../../game/material-values";
import { SkillId } from "../../game/Skill";
import { availableOperations } from "../../game/skill-helpers";
import {
  Board,
  MaterialInstance,
  panelWidth,
  SheetGood,
  ToolItem,
} from "../../game/Materials";
import { HAND_CAPACITY } from "../../game/Person";
import { SHEET_SKUS, SheetSize, sheetSize } from "../../game/sheetStock";
import { ToolId } from "../../game/Tool";
import { cellCenter, motionCell } from "../../game/player-motion";
import { atStand, isSellable, standRect } from "../../game/stand";
import { Vector } from "../../game/Vectors";
import { bootShop } from "../bootstrap";
import { NIGHT_TICKS, TICKS_PER_DAY } from "../../game/time";
import {
  buyBroom,
  buyShopVac,
  pickUpBroom,
  putDownBroom,
  toggleCarryShopVac,
} from "../commands/cleaning-commands";
import { takeCart } from "../commands/cart-commands";
import { beginWakeUp, goHome } from "../commands/day-commands";
import {
  benchOffersPry,
  palletPryTargetsLeft,
  pryPalletNail,
  startGlueUp,
  arrangeBenchMaterial,
} from "../commands/bench-commands";
import {
  finishAttendedWork,
  machineCanOperateNow,
  moveMaterialsToMachine,
  operateMachine,
  putDownCarriedMachine,
  setMachineOperation,
  setMachineSettings,
  takeInputsFromMachine,
  takeOutputsFromMachine,
  toggleMachinePower,
} from "../commands/machine-commands";
import { mountTool, unmountTool } from "../commands/tool-commands";
import { dropMaterial, pickUpMaterial } from "../commands/pile-commands";
import { setOperating, setSweepAim } from "../commands/player-commands";
import { spendSkillPoint } from "../commands/progression-commands";
import { setOutAtStand } from "../commands/stand-commands";
import {
  buyClamp,
  buyConsumablePack,
  buyMachine,
  buyMaterial,
  buyTool,
} from "../commands/store-commands";
import {
  continueScavenging,
  DRIVE_TICKS_ONE_WAY,
  goToStore,
  headHomeFromScavenging,
  returnFromStore,
  SCAVENGE_STOP_NAMES,
  SCAVENGE_STOP_TICKS,
  startScavenging,
} from "../commands/trip-commands";
import {
  loadTruckBed,
  takeCrateFromTruck,
  takeFromTruckBed,
} from "../commands/truck-commands";
import { MachineEntity } from "../entities/MachineEntity";
import { MaterialPileEntity } from "../entities/MaterialPileEntity";
import { Player } from "../entities/Player";
import { ShopVacEntity } from "../entities/ShopVacEntity";
import { StandEntity } from "../entities/StandEntity";
import { TruckEntity } from "../entities/TruckEntity";
import { projectGameState } from "../projection";
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

/**
 * Long enough for the slowest cure in the game with room to spare, short
 * enough that a job which can never finish fails instead of hanging.
 */
const TICK_CEILING = 20_000;

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

  /**
   * The world as a read-only GameState — the old driver's `.shop`
   * assertion surface, served by the projection. For reading in
   * assertions only; writes go through commands (or `arrange`).
   */
  get shop(): GameState {
    return projectGameState(this.game);
  }

  /**
   * Direct arrangement of the world for test setup — the old driver's
   * `arrange`, handed the live Game instead of a state transform. A
   * deliberate backdoor: sequences use it to stage a scenario, never to
   * exercise a player-reachable path.
   */
  arrange(edit: (game: Game) => void): this {
    edit(this.game);
    return this;
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

  /**
   * Select an operation on a machine by id. Resolved against what the
   * station *offers* — the machine's and mounted tools' operations minus
   * skill-locked recipes — exactly as the old driver did, so a sequence
   * can assert that an unmounted tool's recipe is refused.
   */
  select(
    machineTypeId: MachineId,
    operationId: string,
    parameters?: ParameterValues,
  ): this {
    const entity = this.machine(machineTypeId);
    const offered = availableOperations(entity.view(), this.shop.progression);
    const operation = offered.find((op) => op.id === operationId);
    if (!operation) {
      throw new Error(
        `${machineTypeId} does not offer "${operationId}" — it offers ` +
          `[${offered
            .map((op) => op.id)
            .join(
              ", ",
            )}]. A locked skill or an unmounted tool is the usual cause.`,
      );
    }
    setMachineOperation(this.game, entity, operation, parameters);
    return this;
  }

  /**
   * Carry the matching stock onto the station, out of the arms and off the
   * floor, an armful (HAND_CAPACITY) at a time — walking out to each pile
   * and back, the way the player has to. `count` takes only the first so
   * many matches, for recipes that want two of one board and three of
   * another out of a pile of both.
   *
   * The move is checked rather than assumed: a bay with fewer free spaces
   * than the load needs refuses the whole thing, which downstream looks
   * like a station that won't start for no reason.
   */
  load(
    machineTypeId: MachineId,
    predicate: MaterialPredicate,
    count?: number,
  ): this {
    const matches = this.stock(predicate);
    const materials = count === undefined ? matches : matches.slice(0, count);
    if (materials.length === 0) {
      throw new Error(
        `Nothing in reach to load onto the ${machineTypeId} — holding ` +
          `[${this.inventory.map((m) => m.type).join(", ")}], floor has ` +
          `[${this.piles.map((p) => p.material.type).join(", ")}]`,
      );
    }
    if (count !== undefined && materials.length < count) {
      throw new Error(
        `Wanted ${count} matching pieces for the ${machineTypeId}, ` +
          `only ${materials.length} in reach`,
      );
    }
    const before = this.machine(machineTypeId).state.inputMaterials.length;
    const spaces = this.machine(machineTypeId).type.inputSpaces - before;
    if (materials.length > spaces) {
      throw new Error(
        `The ${machineTypeId} would not take ${materials.length} more ` +
          `pieces — its bay holds ${this.machine(machineTypeId).type.inputSpaces} ` +
          `and already had ${before}. Load only what the recipe wants.`,
      );
    }
    // Deposits happen from where the caller stood — the operator's side.
    const at = this.player.cell;
    const wanted = new Set(materials);
    while (wanted.size > 0) {
      const inHand = this.inventory.filter((m) => wanted.has(m));
      if (inHand.length > 0) {
        this.standAt(at);
        moveMaterialsToMachine(this.game, inHand, this.machine(machineTypeId));
        for (const m of inHand) {
          wanted.delete(m);
        }
        continue;
      }
      // The rest is on the floor. Full arms set their (unwanted) load down
      // right here first, where a later fetch can still find it.
      if (this.player.handSpaceLeft === 0) {
        const held = this.inventory.length;
        this.standAt(at);
        dropMaterial(this.game, [...this.inventory]);
        if (this.inventory.length === held) {
          throw new Error(
            `Couldn't set stock down at ${JSON.stringify(at)} to free the hands`,
          );
        }
      }
      const piles = this.piles.filter((pile) => wanted.has(pile.material));
      if (piles.length === 0) {
        throw new Error(
          `Stock for the ${machineTypeId} vanished mid-ferry — this is a ` +
            `driver bug`,
        );
      }
      for (const pile of piles.slice(0, this.player.handSpaceLeft)) {
        const held = this.inventory.length;
        this.standNear(pile);
        pickUpMaterial(this.game, [pile]);
        if (this.inventory.length === held) {
          throw new Error(
            `Couldn't pick ${pile.material.type} up off the floor — ` +
              `holding a tool, or the hands are full`,
          );
        }
      }
    }
    this.standAt(at);
    const after = this.machine(machineTypeId).state.inputMaterials.length;
    if (after !== before + materials.length) {
      throw new Error(
        `The ${machineTypeId} took ${after - before} of ${materials.length} ` +
          `pieces — this is a driver bug`,
      );
    }
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

  /**
   * Pick the finished work up. Feed-through machines (planer, jointer, table
   * saw) deliver to an outfeed cell, so this walks there first, the way the
   * player has to. An armful at a time: what doesn't fit in the hands is
   * set down right where it's collected, where the next `load` will find it.
   */
  collect(machineTypeId: MachineId): this {
    const outfeed = this.machine(machineTypeId).view().absoluteOutputPosition;
    if (outfeed) {
      this.standAt(outfeed);
    }
    while (this.machine(machineTypeId).state.outputMaterials.length > 0) {
      if (this.player.handSpaceLeft === 0) {
        const held = this.inventory.length;
        dropMaterial(this.game, [...this.inventory]);
        if (this.inventory.length === held) {
          throw new Error(
            `Couldn't set stock down while collecting from the ${machineTypeId}`,
          );
        }
        continue;
      }
      const entity = this.machine(machineTypeId);
      const before = entity.state.outputMaterials.length;
      takeOutputsFromMachine(
        this.game,
        entity.state.outputMaterials.slice(0, this.player.handSpaceLeft),
        entity,
      );
      if (this.machine(machineTypeId).state.outputMaterials.length === before) {
        throw new Error(
          `The ${machineTypeId}'s outputs would not come off — holding a tool?`,
        );
      }
    }
    return this;
  }

  /**
   * Whether holding the trigger would start anything right now — the
   * same question `operate` asks before it acts. Sequence tests use it
   * to assert a machine *refuses*: no lane for an 8-foot sheet, no
   * clamps free for a straightedge.
   */
  canOperate(machineTypeId: MachineId): boolean {
    return machineCanOperateNow(this.game, this.machine(machineTypeId));
  }

  // ------------------------------------------------------------------
  // Tools: physical things that mount into a station's slots.
  // ------------------------------------------------------------------

  /**
   * Bolt a tool onto the station. Tools are physical things, so the tool
   * is fetched from wherever it's resting first — the arms, a floor pile,
   * or the truck's bed — the same trips a player makes. A bench has a
   * fixed number of slots, so this fails rather than silently doing
   * nothing when they're all taken — unmount something, or build a
   * worktable.
   */
  mount(machineTypeId: MachineId, toolId: ToolId): this {
    if (this.machine(machineTypeId).state.tools.includes(toolId)) {
      return this;
    }
    const tool = this.fetchTool(toolId);
    mountTool(this.game, this.machine(machineTypeId), tool);
    if (!this.machine(machineTypeId).state.tools.includes(toolId)) {
      const station = this.machine(machineTypeId);
      throw new Error(
        `The ${machineTypeId} would not take the ${toolId}. It has ` +
          `${station.type.toolSlots} slots holding ` +
          `[${station.state.tools.join(", ")}].`,
      );
    }
    return this;
  }

  /**
   * Get the named tool into the arms: already carried, picked up off a
   * floor pile, or lifted out of the truck's bed. Fails if the shop
   * doesn't own a loose one — buy or build it first.
   */
  private fetchTool(toolId: ToolId): ToolItem {
    const isTheTool = (material: MaterialInstance): material is ToolItem =>
      material.type === "tool" && material.toolId === toolId;
    const carried = this.inventory.find(isTheTool);
    if (carried) {
      return carried;
    }
    // Full arms can't pick anything up — stage the load on the floor first
    if (this.player.handSpaceLeft === 0) {
      this.standAt(this.shopInfo.info.materialDropoffPosition);
      dropMaterial(this.game, [...this.inventory]);
    }
    const pile = this.piles.find((candidate) => isTheTool(candidate.material));
    if (pile) {
      this.standNear(pile);
      pickUpMaterial(this.game, [pile]);
    } else {
      const inBed = this.truck.bed.find(isTheTool);
      if (inBed) {
        this.standAtBed();
        takeFromTruckBed(this.game, [inBed]);
      }
    }
    const fetched = this.inventory.find(isTheTool);
    if (!fetched) {
      throw new Error(
        `No loose ${toolId} anywhere — not in hand, in a pile, or in the ` +
          `truck's bed. Buy or build one first.`,
      );
    }
    return fetched;
  }

  /** Take a tool back off a station, into the arms — it's a physical thing. */
  unmount(machineTypeId: MachineId, toolId: ToolId): this {
    // The tool comes off into the arms, so make sure they have room
    if (this.player.handSpaceLeft === 0) {
      this.standAt(this.shopInfo.info.materialDropoffPosition);
      dropMaterial(this.game, [...this.inventory]);
    }
    unmountTool(this.game, this.machine(machineTypeId), toolId);
    if (this.machine(machineTypeId).state.tools.includes(toolId)) {
      throw new Error(`The ${toolId} would not come off the ${machineTypeId}`);
    }
    return this;
  }

  /**
   * Make sure exactly these tools are on the station, swapping as needed. Two
   * slots on the starter bench is not many, and by the middle of the game a
   * playthrough is juggling a hammer, a sanding block and a drill.
   */
  fitOut(machineTypeId: MachineId, toolIds: ReadonlyArray<ToolId>): this {
    for (const mounted of [...this.machine(machineTypeId).state.tools]) {
      if (!toolIds.includes(mounted)) {
        this.unmount(machineTypeId, mounted);
      }
    }
    for (const toolId of toolIds) {
      this.mount(machineTypeId, toolId);
    }
    return this;
  }

  // ------------------------------------------------------------------
  // The day cycle: driving home and sleeping to the next morning.
  // ------------------------------------------------------------------

  /**
   * Call it a day the way the player does: walk to the cab, drive home,
   * and wake up the next morning — the overnight runs as one batch of
   * ordinary sim minutes (cures finish overnight). The wake is the
   * split command: beginWakeUp queues the night on the SleepSystem, and
   * this loop steps the engine until the truck pulls back in.
   */
  sleep(): this {
    this.standAtCab();
    goHome(this.game);
    if (this.player.away?.kind !== "home") {
      throw new Error(
        "The drive home would not start — hands full, or mid-trip already",
      );
    }
    const before = this.clock.day;
    beginWakeUp(this.game);
    // One sim minute per engine tick, plus a tick on each end (the first
    // feed and the morning bookkeeping) — the guard is slack on purpose.
    for (
      let guard = 0;
      guard < NIGHT_TICKS + 60 && this.player.away !== null;
      guard++
    ) {
      this.stepEngine(1);
    }
    if (this.player.away || this.clock.day !== before + 1) {
      throw new Error("Morning never came — this is a driver bug");
    }
    return this;
  }

  /**
   * Sleep off the night if the shop has closed — or, given a budget, if
   * fewer than `ticksNeeded` of today are left — putting the body back
   * where it stood. Verbs that wait out something time-shaped run
   * through this, so a long sequence rolls through its days the way a
   * player does — nothing new starts at night, but nobody wants a test
   * to fail over it either.
   */
  private ensureDaylight(ticksNeeded = 0): this {
    if (
      !this.clock.isNight() &&
      this.clock.dayTicksSpent() + ticksNeeded <= TICKS_PER_DAY
    ) {
      return this;
    }
    const cell = this.player.cell;
    this.sleep();
    return this.standAt(cell);
  }

  /**
   * Clear the loose stock lying on a bench back into the arms — a
   * teardown's freed boards live in the input bay (they stay on the bench,
   * see pryPalletNail), so collect() never sees them. An armful at a
   * time, dropping what doesn't fit at the feet, exactly like collect().
   */
  takeStock(machineTypeId: MachineId): this {
    while (this.machine(machineTypeId).state.inputMaterials.length > 0) {
      if (this.player.handSpaceLeft === 0) {
        const held = this.inventory.length;
        dropMaterial(this.game, [...this.inventory]);
        if (this.inventory.length === held) {
          throw new Error(
            `Couldn't set stock down while clearing the ${machineTypeId}`,
          );
        }
        continue;
      }
      const entity = this.machine(machineTypeId);
      const before = entity.state.inputMaterials.length;
      takeInputsFromMachine(
        this.game,
        entity.state.inputMaterials.slice(0, this.player.handSpaceLeft),
        entity,
      );
      if (this.machine(machineTypeId).state.inputMaterials.length === before) {
        throw new Error(
          `The ${machineTypeId}'s stock would not come off — holding a tool?`,
        );
      }
    }
    return this;
  }

  /**
   * Start the station and stay on it until the work is done. For legacy
   * operations that means holding the operate key through the ticks. For
   * interactive operations (the bench view's hand work) the driver
   * commits through the SAME commands the mini-game commits through —
   * start, then `finishAttendedWork` — with no mini-game in between;
   * there is nothing else it could legally hold. Either way, hands-free
   * phases (glue curing) run out on the clock, so one verb covers both
   * halves of a glue-up.
   *
   * (The old driver slept off the night before starting; sleeping
   * arrives with the day-cycle port, so nothing guards daylight yet.)
   */
  run(machineTypeId: MachineId): this {
    // Dismantling never "runs": a staged pallet transforms nail by nail
    // through incremental commits — no plan is ever selected for it — so
    // one run() is one whole teardown.
    const selected = this.machine(machineTypeId).view().selectedOperationOrNull;
    if (this.offersPry(machineTypeId)) {
      return this.performWork(machineTypeId);
    }

    operateMachine(this.game, this.machine(machineTypeId));
    if (
      this.machine(machineTypeId).state.operationProgress.status !==
      "inProgress"
    ) {
      throw new Error(
        `The ${machineTypeId} would not start. Unpowered, nothing loaded, ` +
          `or short of clamps or supplies.`,
      );
    }
    if (selected?.interaction) {
      return this.performWork(machineTypeId);
    }
    this.holdOperate(true);
    for (let i = 0; i < TICK_CEILING; i++) {
      this.tick();
      if (
        this.machine(machineTypeId).state.operationProgress.status !==
        "inProgress"
      ) {
        return this.holdOperate(false);
      }
    }
    this.holdOperate(false);
    throw new Error(
      `The ${machineTypeId} never finished in ${TICK_CEILING} ticks. An ` +
        `attended phase with the player standing somewhere else is the usual cause.`,
    );
  }

  /**
   * Complete a station's interactive hand work through the real commit
   * commands — the same ones the bench view dispatches, with no mini-game
   * in between. Assumes the operation is already started (run() does
   * that) except for pry work, which never starts an operation at all:
   * a staged pallet is torn down pull by pull. Ends by ticking out any
   * hands-free remainder (a glue-up's cure).
   */
  performWork(machineTypeId: MachineId): this {
    if (this.offersPry(machineTypeId)) {
      let pulls = palletPryTargetsLeft(this.machine(machineTypeId).view());
      if (pulls === 0) {
        throw new Error(
          `Nothing on the ${machineTypeId} to pry — stage a pallet first`,
        );
      }
      while (pulls > 0) {
        pryPalletNail(this.game, this.machine(machineTypeId));
        const left = palletPryTargetsLeft(this.machine(machineTypeId).view());
        if (left >= pulls) {
          throw new Error(
            `A pry at the ${machineTypeId} freed nothing — the player ` +
              `isn't standing at it, or the skill is locked`,
          );
        }
        pulls = left;
      }
      return this;
    }

    if (
      this.machine(machineTypeId).state.operationProgress.status !==
      "inProgress"
    ) {
      throw new Error(
        `No work in progress on the ${machineTypeId} to perform — run() starts it`,
      );
    }
    finishAttendedWork(this.game, this.machine(machineTypeId));
    // A hands-free remainder (the cure) runs out on the clock
    for (let i = 0; i < TICK_CEILING; i++) {
      if (
        this.machine(machineTypeId).state.operationProgress.status !==
        "inProgress"
      ) {
        return this;
      }
      this.tick();
    }
    throw new Error(
      `The ${machineTypeId}'s hand work never resolved in ${TICK_CEILING} ` +
        `ticks. finishAttendedWork refusing (player not at the ` +
        `station?) is the usual cause.`,
    );
  }

  /**
   * Whether the station's bench view would be offering pry work right
   * now: idle, a pallet staged, dismantling known. Mirrors
   * benchScriptFor's pallet-wins rule — no plan selection involved.
   */
  private offersPry(machineTypeId: MachineId): boolean {
    return benchOffersPry(this.game, this.machine(machineTypeId));
  }

  /**
   * One whole job on a direct-feed machine: dial the settings, set the stock
   * down, hold the trigger, collect at the outfeed. No plan is chosen — which
   * operation runs is inferred from what's on the table.
   */
  feed(
    machineTypeId: MachineId,
    stock: MaterialPredicate,
    settings?: ParameterValues,
  ): this {
    this.standAtOperatorCell(machineTypeId);
    if (settings) {
      this.setSettings(machineTypeId, settings);
    }
    return this.load(machineTypeId, stock, 1)
      .run(machineTypeId)
      .collect(machineTypeId);
  }

  /**
   * One whole clamps-first glue-up — no plan, exactly like the bench
   * view: the matching staged stock is laid edge to edge across the
   * bench (real arrange commits, so the run detection sees what a
   * player's drags would leave), the tighten claims it through
   * startGlueUp — the composition decides which recipe is credited —
   * and the cure runs out on the clock. Pieces glue in staged order;
   * there is no count because the run takes whatever matches, two or
   * more.
   */
  glueUp(machineTypeId: MachineId, stock?: MaterialPredicate): this {
    this.standAtOperatorCell(machineTypeId);
    const machine = this.machine(machineTypeId).view();
    const pieces = machine.inputMaterials.filter(
      stock ??
        ((m) =>
          m.type === "board" ||
          m.type === "panel" ||
          m.type === "endGrainSlice"),
    );
    if (pieces.length < 2) {
      throw new Error(
        `A glue-up at the ${machineTypeId} needs at least two staged pieces, ` +
          `found ${pieces.length}`,
      );
    }
    // Lay the run edge to edge across the bench center, first piece
    // leftmost — widths across, lengths down, nothing on edge.
    const widthOf = (m: MaterialInstance): number =>
      m.type === "board"
        ? m.width
        : m.type === "panel"
          ? panelWidth(m)
          : m.type === "endGrainSlice"
            ? m.thickness / 4
            : 0;
    const bench = benchTopSizeIn(machine.type);
    const span = pieces.reduce((sum, piece) => sum + widthOf(piece), 0);
    let across = -span / 2;
    for (const piece of pieces) {
      arrangeBenchMaterial(this.game, this.machine(machineTypeId), piece.id, {
        xIn: bench.widthIn / 2 + across + widthOf(piece) / 2,
        yIn: bench.heightIn / 2,
        angleDeg: 0,
        flipped: false,
      });
      across += widthOf(piece);
    }
    startGlueUp(
      this.game,
      this.machine(machineTypeId),
      pieces.map((piece) => piece.id),
    );
    if (
      this.machine(machineTypeId).state.operationProgress.status !==
      "inProgress"
    ) {
      throw new Error(
        `The glue-up at the ${machineTypeId} would not start. Unprepped ` +
          `stock, a locked skill, or short of clamps.`,
      );
    }
    return this.performWork(machineTypeId).collect(machineTypeId);
  }

  /**
   * One whole job: set the plan, load the stock, run it out, pick it up.
   * The shape almost every step of a chain takes.
   */
  make(
    machineTypeId: MachineId,
    operationId: string,
    stock: MaterialPredicate,
    options?: { parameters?: ParameterValues; count?: number },
  ): this {
    return this.standAtOperatorCell(machineTypeId)
      .select(machineTypeId, operationId, options?.parameters)
      .load(machineTypeId, stock, options?.count)
      .run(machineTypeId)
      .collect(machineTypeId);
  }

  // ------------------------------------------------------------------
  // Leaving the shop, spending money, and handing work over. A chain test
  // starts from a fixture that already owns its machines; a playthrough
  // has to buy them, which means these.
  // ------------------------------------------------------------------

  /**
   * Take the truck out scavenging, work the given number of stops, and
   * pull back into the shop with the haul ferried out of the bed onto
   * the dropoff spot. The circuit is rolled up front from the rng; the
   * default finds a pallet with all eight deck boards and solid
   * stringers at each stop searched, so sequences can count on the wood
   * — two stops means two pristine pallets, and the errand costs only
   * the searching: half an hour a stop, nothing for the drive back.
   * (The old driver slept off the night first if the trip wouldn't fit
   * the day; sleeping arrives with the day-cycle port.)
   */
  scavenge({
    stops = 2,
    rng,
  }: { stops?: number; rng?: () => number } = {}): this {
    if (stops < 1 || stops > SCAVENGE_STOP_NAMES.length) {
      throw new Error(`A trip searches 1-${SCAVENGE_STOP_NAMES.length} stops`);
    }
    this.standAtCab();
    startScavenging(this.game, rng ?? pristineFindsRng(stops));
    if (!this.player.away) {
      throw new Error(
        "The scavenging trip would not start — hands full, or mid-trip already",
      );
    }
    for (let searched = 1; searched <= stops; searched++) {
      this.tick(SCAVENGE_STOP_TICKS + 1);
      const away = this.player.away;
      if (away?.kind !== "scavenging" || away.phase.kind !== "deciding") {
        throw new Error(
          `The search should have parked at a decision after stop ${searched}`,
        );
      }
      if (searched < stops) {
        continueScavenging(this.game);
      }
    }
    // Calling it good enough is instant — the truck is back at the shop
    // with the haul in its bed the same tick.
    headHomeFromScavenging(this.game);
    if (this.player.away) {
      throw new Error("Still out scavenging after the trip should have ended");
    }
    return this.unloadBed();
  }

  /** Take a trip out to a store, if the truck offers it yet. The drive
   * out charges its minutes here, as the old action did itself. */
  goShopping(store: StoreId): this {
    const unlocked =
      store === "orangeBox"
        ? this.progression.storeUnlocked
        : this.progression.lumberyardUnlocked;
    if (!unlocked) {
      throw new Error(
        `The truck doesn't offer ${store} yet — check the progression flags`,
      );
    }
    this.standAtCab();
    goToStore(this.game, store);
    if (this.player.away?.kind !== "shopping") {
      throw new Error(
        `The trip to ${store} would not start — hands full, or mid-trip already`,
      );
    }
    this.tick(DRIVE_TICKS_ONE_WAY);
    return this;
  }

  /** Grab a flatbed from the corral by the entrance — the walkable
   * store's first stop (the shelves only load a cart you're pushing). */
  takeCart(): this {
    takeCart(this.game);
    const away = this.player.away;
    if (away?.kind !== "shopping" || !away.hasCart) {
      throw new Error("No cart in hand — is the trip underway?");
    }
    return this;
  }

  /**
   * Come home from a trip and unload the truck: purchases ride in the
   * bed, so pulling in ends with tailgate-to-dropoff trips that stage
   * the stock on the floor — the same walk the player makes. Crated
   * machines stay in the bed until buyAndPlaceMachine lifts them. The
   * drive home charges its minutes before the player steps out, as the
   * old action did itself.
   */
  comeHome(): this {
    if (this.player.away?.kind === "shopping") {
      this.tick(DRIVE_TICKS_ONE_WAY);
    }
    returnFromStore(this.game);
    return this.unloadBed();
  }

  /** Buy stock off a rack. The caller names the price the rack charges. */
  buy(material: MaterialInstance, price: number): this {
    const before = this.wallet.money;
    buyMaterial(this.game, material, price);
    if (this.wallet.money !== before - price) {
      throw new Error(
        `Couldn't afford ${material.type} at $${price} — the shop had $${before}`,
      );
    }
    return this;
  }

  /**
   * Buy `count` boards off a named lumber channel, at whatever that channel
   * charges — so a repriced rack changes what a playthrough can afford
   * instead of quietly staying free.
   */
  buyBoards(
    channelId: string,
    species: Board["species"],
    dimensions: {
      length: Board["length"];
      width: Board["width"];
      thickness: Board["thickness"];
    },
    count = 1,
  ): this {
    const channel = LUMBER_CHANNELS.find(
      (candidate) => candidate.id === channelId,
    );
    if (!channel) {
      throw new Error(`No lumber channel called ${channelId}`);
    }
    if (this.reputation.reputation < channel.minReputation) {
      throw new Error(
        `The ${channelId} rack needs ${channel.minReputation} reputation and ` +
          `the shop has ${this.reputation.reputation} — a channel this rung needs ` +
          `is out of reach`,
      );
    }
    for (let i = 0; i < count; i++) {
      const stock = board(
        species,
        dimensions.length,
        dimensions.width,
        dimensions.thickness,
        channel.surface,
      );
      this.buy(stock, getBoardBuyPrice(stock, channel.priceMultiplier));
    }
    return this;
  }

  /** Buy a sheet off the Sheet Goods aisle, at what the aisle charges. */
  buySheet(kind: SheetGood["kind"], size: SheetSize["id"] = "full"): this {
    const sku = SHEET_SKUS.find((candidate) => candidate.kind === kind);
    if (!sku) {
      throw new Error(`The aisle doesn't stock ${kind}`);
    }
    if (this.reputation.reputation < sku.minReputation) {
      throw new Error(
        `${kind} needs ${sku.minReputation} reputation and the shop has ` +
          `${this.reputation.reputation}`,
      );
    }
    const racked = sheetSize(size);
    const sheet = makeMaterial<SheetGood>({
      type: "plywood",
      kind,
      length: racked.length,
      width: racked.width,
      thickness: sku.thickness,
    });
    return this.buy(sheet, getSheetBuyPrice(sheet));
  }

  /** Buy a pack of supplies (nails, screws, oil). */
  buySupplies(consumableId: ConsumableId): this {
    const before = this.wallet.money;
    buyConsumablePack(this.game, consumableId);
    if (this.wallet.money === before) {
      throw new Error(`Couldn't afford a pack of ${consumableId}`);
    }
    return this;
  }

  /** Buy a clamp bar. Glue-ups tie clamps up until they've cured. */
  buyClamps(count: number): this {
    for (let i = 0; i < count; i++) {
      const before = this.consumables.clamps;
      buyClamp(this.game);
      if (this.consumables.clamps === before) {
        throw new Error(`Couldn't afford clamp ${i + 1} of ${count}`);
      }
    }
    return this;
  }

  /**
   * Buy a tool off the tool wall. It lands in the truck's bed like any
   * other purchase; mount it separately.
   */
  buyTool(toolId: ToolId): this {
    const before = this.truck.bed.length;
    buyTool(this.game, toolId);
    if (this.truck.bed.length === before) {
      throw new Error(
        `Couldn't afford the ${toolId} — the shop had $${this.wallet.money}`,
      );
    }
    return this;
  }

  /**
   * Buy a machine and carry it to where it's going to live. It rides
   * home crated in the truck's bed, gets lifted out at the tailgate, and
   * is set down standing at the cell it will be worked from — the same
   * steps the floor demands, so a machine that can't physically fit
   * fails here rather than silently never arriving. (The sequence tier
   * doesn't model the drive home; the crate is lifted from the bed
   * whenever this runs, mid-trip or after.)
   */
  buyAndPlaceMachine(
    machineTypeId: MachineId,
    price: number,
    operatorCell: Vector,
  ): this {
    const before = this.wallet.money;
    buyMachine(this.game, machineTypeId, price);
    if (this.wallet.money !== before - price) {
      throw new Error(
        `Couldn't afford the ${machineTypeId} at $${price} — the shop had $${before}`,
      );
    }
    const crate = this.truck.crates.find(
      (candidate) => candidate.machineTypeId === machineTypeId,
    );
    if (!crate) {
      throw new Error(`No ${machineTypeId} crate arrived in the truck's bed`);
    }
    this.standAtBed();
    takeCrateFromTruck(this.game, machineTypeId);
    if (!this.player.carriedMachine) {
      throw new Error(
        `Couldn't lift the ${machineTypeId} crate. A crate takes both hands, ` +
          `and the player is holding ` +
          `[${this.inventory.map((m) => m.type).join(", ")}] — ` +
          `putEverythingDown() first.`,
      );
    }
    this.standAt(operatorCell);
    if (!putDownCarriedMachine(this.game)) {
      throw new Error(
        `No room to set the ${machineTypeId} down from ${operatorCell} — ` +
          `something already occupies the cells it needs`,
      );
    }
    // Out of the crate a powered machine is switched off. Throw the switch
    // here so a rung reads as "buy the saw" rather than "buy the saw, and
    // remember the thing every machine needs".
    if (this.machine(machineTypeId).type.powerSwitch) {
      this.switchOn(machineTypeId);
    }
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
   * stand, sleeping through nights as they come (nobody walks by after
   * close). Sales roll from the game's seeded rng, so a sequence lands
   * the same buyers every run; the ceiling is generous enough that a
   * stocked stand can't miss it, and anything slower fails loudly.
   */
  awaitSales(count = 1): this {
    const target = this.progression.salesCompleted + count;
    for (
      let guard = 0;
      guard < 400 && this.progression.salesCompleted < target;
      guard++
    ) {
      this.ensureDaylight(25);
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

/**
 * The default scavenging rng: a scripted roll tape that finds a pallet
 * with all eight deck boards and solid stringers at each of the first
 * `finds` stops and nothing after. Written against the roll order in
 * rollScavengeStops — per stop, one find roll, then (on a find) the deck
 * count, seven shuffle rolls, and the stringers.
 */
function pristineFindsRng(finds: number): () => number {
  const tape: number[] = [];
  for (let stop = 0; stop < SCAVENGE_STOP_NAMES.length; stop++) {
    if (stop < finds) {
      // find, deck count (5 + floor(0.99 * 4) = 8), shuffle, stringers
      tape.push(0, 0.99, ...Array<number>(7).fill(0.5), 0.9);
    } else {
      tape.push(0.9);
    }
  }
  let i = 0;
  return () => tape[Math.min(i++, tape.length - 1)];
}
