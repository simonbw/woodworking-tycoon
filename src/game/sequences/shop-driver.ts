/**
 * A shop you can work without a browser.
 *
 * These sequence tests sit between the unit tests and the E2E specs. A unit
 * test asks whether one recipe or one action is right; an E2E spec asks
 * whether the UI exposes it. Neither asks the question in between — whether
 * a *run of work* comes out right when you do the whole thing in order,
 * ticking the clock as you go. That used to be answerable only in Playwright,
 * where a chain costs seconds; here it costs milliseconds.
 *
 * The driver holds state and mutates it, so a test reads as a list of jobs
 * rather than a chain of `state = f(state)`. It only ever goes through the
 * real actions in `game-actions/`, so anything it can do, a player can do —
 * and anything it can't, the actions have to grow first.
 */

import {
  Machine,
  MachineState,
  Operation,
  ParameterValues,
  getMachines,
} from "../Machine";
import { GameAction, GameState } from "../GameState";
import { MaterialInstance } from "../Materials";
import { handSpaceLeft } from "../Person";
import { consumeRequiredMaterials } from "../delivery";
import { availableOperations } from "../skill-helpers";
import { tickAction } from "../game-actions/tickAction";
import {
  dropMaterialAction,
  moveMaterialsToMachineAction,
  operateMachineAction,
  pickUpMaterialAction,
  setMachineOperationAction,
  setMachineSettingsAction,
  setOperatingAction,
  setPlayerPositionAction,
  takeOutputsFromMachineAction,
  toggleMachinePowerAction,
} from "../game-actions/player-actions";
import {
  buyToolAction,
  mountToolAction,
  unmountToolAction,
} from "../game-actions/tool-actions";
import {
  buyClampAction,
  buyConsumablePackAction,
  buyMachineAction,
  buyMaterialAction,
  completeCommissionAction,
} from "../game-actions/store-actions";
import {
  canPutDownCarriedMachine,
  putDownCarriedMachineAction,
} from "../game-actions/machine-actions";
import {
  loadTruckBedAction,
  takeCrateFromTruckAction,
  takeFromTruckBedAction,
} from "../game-actions/truck-actions";
import { isOutdoors, truckCabSideCell } from "../lot";
import {
  goToStoreAction,
  returnFromStoreAction,
  storeUnlocked,
} from "../game-actions/door-actions";
import {
  SCAVENGE_DURATION_TICKS,
  startScavengingAction,
} from "../game-actions/scavenge-actions";
import { clearPendingPayoutsAction } from "../game-actions/payout-actions";
import { spendSkillPointAction } from "../game-actions/skill-actions";
import { getActiveCommission } from "../commissionSequence";
import { board } from "../board-helpers";
import { LUMBER_CHANNELS } from "../lumberStock";
import { getBoardBuyPrice, getSheetBuyPrice } from "../material-values";
import { SHEET_SKUS } from "../sheetStock";
import { makeMaterial } from "../material-helpers";
import { Board, SheetGood } from "../Materials";
import { ConsumableId } from "../Consumable";
import { MachineId } from "../Machine";
import { SkillId } from "../Skill";
import { StoreId } from "../lumberStock";
import { ToolId } from "../Tool";
import { Vector } from "../Vectors";

/** Matches the stock a job wants out of wherever it's being taken from. */
type MaterialPredicate = (material: MaterialInstance) => boolean;

/**
 * Long enough for the slowest cure in the game with room to spare, short
 * enough that a job which can never finish fails instead of hanging. The
 * simulation runs about 400k ticks a second, so the ceiling is cheap.
 */
const TICK_CEILING = 20_000;

export class ShopDriver {
  private state: GameState;

  constructor(initial: GameState) {
    this.state = initial;
  }

  /** The shop as it stands. */
  get shop(): GameState {
    return this.state;
  }

  get inventory(): ReadonlyArray<MaterialInstance> {
    return this.state.player.inventory;
  }

  get money(): number {
    return this.state.money;
  }

  /** Everything in hand that the predicate matches. */
  holding(predicate: MaterialPredicate): ReadonlyArray<MaterialInstance> {
    return this.inventory.filter(predicate);
  }

  /**
   * Everything within reach that the predicate matches — in the arms or
   * piled on the floor. The hands hold two pieces (HAND_CAPACITY), so a
   * chain's stock lives mostly on the floor between steps; what a test
   * usually wants to know is "does the shop have it", and this is that.
   */
  stock(predicate: MaterialPredicate): ReadonlyArray<MaterialInstance> {
    return [
      ...this.inventory.filter(predicate),
      ...this.state.materialPiles
        .map((pile) => pile.material)
        .filter(predicate),
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
          `floor [${this.state.materialPiles.map((p) => p.material.type).join(", ")}]`,
      );
    }
    return matches[0];
  }

  /** Run any action that this driver has no verb for. */
  apply(action: GameAction): this {
    this.state = action(this.state);
    return this;
  }

  /**
   * Edit the shop directly, for setup a player can't perform — granting a
   * skill the journal would charge points for, say. Never use it to skip a
   * step the sequence is meant to be testing.
   */
  arrange(edit: (state: GameState) => GameState): this {
    this.state = edit(this.state);
    return this;
  }

  /** Let the clock run with nobody working. */
  tick(count = 1): this {
    for (let i = 0; i < count; i++) {
      this.state = tickAction(this.state);
    }
    return this;
  }

  /**
   * The station of this type. Machines are looked up fresh every time
   * because every action returns a new state — holding on to a `Machine`
   * across a step means acting on a stale one, which is how a mounted tool's
   * operations go missing.
   */
  machine(machineTypeId: MachineState["machineTypeId"]): Machine {
    const found = getMachines(this.state.machines).find(
      (candidate) => candidate.state.machineTypeId === machineTypeId,
    );
    if (!found) {
      throw new Error(
        `No ${machineTypeId} in this shop — it has [${this.state.machines
          .map((m) => m.machineTypeId)
          .join(", ")}]`,
      );
    }
    return found;
  }

  /**
   * Walk to a cell. Which way the player ends up facing doesn't decide
   * anything a sequence tests — reach is by cell — so it keeps its heading.
   */
  standAt(position: Vector): this {
    return this.apply(
      setPlayerPositionAction(position, this.state.player.direction),
    );
  }

  /**
   * Stand where this machine is worked from. Attended phases check the
   * player's cell every tick, so a job run from the wrong side of the
   * machine stalls instead of failing — hence a verb for it rather than
   * coordinates in every test.
   */
  standAtOperatorCell(machineTypeId: MachineState["machineTypeId"]): this {
    const cell = this.machine(machineTypeId).absoluteOperationPosition;
    if (!cell) {
      throw new Error(`${machineTypeId} has no operator cell`);
    }
    return this.standAt(cell);
  }

  /**
   * Bolt a tool from storage onto the station. A bench has a fixed number of
   * slots, so this fails rather than silently doing nothing when they're all
   * taken — unmount something, or build a worktable.
   */
  mount(machineTypeId: MachineState["machineTypeId"], toolId: ToolId): this {
    if (this.machine(machineTypeId).state.tools.includes(toolId)) {
      return this;
    }
    this.apply(mountToolAction(this.machine(machineTypeId), toolId));
    if (!this.machine(machineTypeId).state.tools.includes(toolId)) {
      const station = this.machine(machineTypeId);
      throw new Error(
        `The ${machineTypeId} would not take the ${toolId}. It has ` +
          `${station.type.toolSlots} slots holding ` +
          `[${station.state.tools.join(", ")}]` +
          `${this.state.storage.tools.includes(toolId) ? "" : ", and the tool isn't in storage"}.`,
      );
    }
    return this;
  }

  /** Take a tool back off a station, freeing its slot. */
  unmount(machineTypeId: MachineState["machineTypeId"], toolId: ToolId): this {
    this.apply(unmountToolAction(this.machine(machineTypeId), toolId));
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
  fitOut(
    machineTypeId: MachineState["machineTypeId"],
    toolIds: ReadonlyArray<ToolId>,
  ): this {
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

  /**
   * Flip a machine's power switch on. Powered machines arrive from the crate
   * switched off and cut nothing until someone throws the switch — so this is
   * a step, not a detail, for every machine a playthrough buys.
   */
  switchOn(machineTypeId: MachineState["machineTypeId"]): this {
    if (this.machine(machineTypeId).isPowered) {
      return this;
    }
    this.apply(toggleMachinePowerAction(this.machine(machineTypeId)));
    if (!this.machine(machineTypeId).isPowered) {
      throw new Error(`The ${machineTypeId} would not switch on`);
    }
    return this;
  }

  /** The operation by id, including any the mounted tools contribute. */
  private operation(
    machineTypeId: MachineState["machineTypeId"],
    operationId: string,
  ): Operation {
    const machine = this.machine(machineTypeId);
    const found = availableOperations(machine, this.state.progression).find(
      (candidate) => candidate.id === operationId,
    );
    if (!found) {
      throw new Error(
        `${machineTypeId} does not offer "${operationId}" — it offers ` +
          `[${availableOperations(machine, this.state.progression)
            .map((op) => op.id)
            .join(", ")}]. A locked skill or an unmounted tool is the usual cause.`,
      );
    }
    return found;
  }

  /**
   * Set the station's plan, and its settings if the plan has any — the angle
   * and target length on a saw cut, say. Anything left out keeps the
   * operation's own default, exactly as the sheet's scales do.
   */
  select(
    machineTypeId: MachineState["machineTypeId"],
    operationId: string,
    parameters?: ParameterValues,
  ): this {
    return this.apply(
      setMachineOperationAction(
        this.machine(machineTypeId),
        this.operation(machineTypeId, operationId),
        parameters,
      ),
    );
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
    machineTypeId: MachineState["machineTypeId"],
    predicate: MaterialPredicate,
    count?: number,
  ): this {
    const matches = this.stock(predicate);
    const materials = count === undefined ? matches : matches.slice(0, count);
    if (materials.length === 0) {
      throw new Error(
        `Nothing in reach to load onto the ${machineTypeId} — holding ` +
          `[${this.inventory.map((m) => m.type).join(", ")}], floor has ` +
          `[${this.state.materialPiles.map((p) => p.material.type).join(", ")}]`,
      );
    }
    if (count !== undefined && materials.length < count) {
      throw new Error(
        `Wanted ${count} matching pieces for the ${machineTypeId}, ` +
          `only ${materials.length} in reach`,
      );
    }
    const before = this.machine(machineTypeId).state.inputMaterials.length;
    const spaces =
      this.machine(machineTypeId).type.inputSpaces - before;
    if (materials.length > spaces) {
      throw new Error(
        `The ${machineTypeId} would not take ${materials.length} more ` +
          `pieces — its bay holds ${this.machine(machineTypeId).type.inputSpaces} ` +
          `and already had ${before}. Load only what the recipe wants.`,
      );
    }
    // Deposits happen from where the caller stood — the operator's side.
    const at = this.state.player.position;
    const wanted = new Set(materials);
    while (wanted.size > 0) {
      const inHand = this.inventory.filter((m) => wanted.has(m));
      if (inHand.length > 0) {
        this.standAt(at);
        this.apply(
          moveMaterialsToMachineAction(inHand, this.machine(machineTypeId)),
        );
        for (const m of inHand) {
          wanted.delete(m);
        }
        continue;
      }
      // The rest is on the floor. Full arms set their (unwanted) load down
      // right here first, where a later fetch can still find it.
      if (handSpaceLeft(this.state.player) === 0) {
        const held = this.inventory.length;
        this.standAt(at);
        this.apply(dropMaterialAction(this.inventory));
        if (this.inventory.length === held) {
          throw new Error(
            `Couldn't set stock down at ${JSON.stringify(at)} to free the hands`,
          );
        }
      }
      const piles = this.state.materialPiles.filter((pile) =>
        wanted.has(pile.material),
      );
      if (piles.length === 0) {
        throw new Error(
          `Stock for the ${machineTypeId} vanished mid-ferry — this is a ` +
            `driver bug`,
        );
      }
      for (const pile of piles.slice(
        0,
        handSpaceLeft(this.state.player),
      )) {
        const held = this.inventory.length;
        this.standAt(pile.position).apply(pickUpMaterialAction([pile]));
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

  /**
   * Start the station and stay on it until the work is done, holding the
   * operate key the whole time. That grip is what makes attended phases
   * legal — the flag lives in GameState, so a tick loop reads it exactly
   * as a real one does — and hands-free phases ignore it, so one verb
   * covers both halves of a glue-up.
   */
  run(machineTypeId: MachineState["machineTypeId"]): this {
    this.apply(operateMachineAction(this.machine(machineTypeId)));
    if (this.machine(machineTypeId).state.operationProgress.status !== "inProgress") {
      throw new Error(
        `The ${machineTypeId} would not start. Unpowered, nothing loaded, ` +
          `or short of clamps or supplies.`,
      );
    }
    this.apply(setOperatingAction(true));
    for (let i = 0; i < TICK_CEILING; i++) {
      this.tick();
      if (
        this.machine(machineTypeId).state.operationProgress.status !==
        "inProgress"
      ) {
        return this.apply(setOperatingAction(false));
      }
    }
    this.apply(setOperatingAction(false));
    throw new Error(
      `The ${machineTypeId} never finished in ${TICK_CEILING} ticks. An ` +
        `attended phase with the player standing somewhere else is the usual cause.`,
    );
  }

  /**
   * Pick the finished work up. Feed-through machines (planer, jointer, table
   * saw) deliver to an outfeed cell, so this walks there first, the way the
   * player has to. An armful at a time: what doesn't fit in the hands is
   * set down right where it's collected, where the next `load` will find it.
   */
  collect(machineTypeId: MachineState["machineTypeId"]): this {
    const outfeed = this.machine(machineTypeId).absoluteOutputPosition;
    if (outfeed) {
      this.standAt(outfeed);
    }
    while (this.machine(machineTypeId).state.outputMaterials.length > 0) {
      if (handSpaceLeft(this.state.player) === 0) {
        const held = this.inventory.length;
        this.apply(dropMaterialAction(this.inventory));
        if (this.inventory.length === held) {
          throw new Error(
            `Couldn't set stock down while collecting from the ${machineTypeId}`,
          );
        }
        continue;
      }
      const machine = this.machine(machineTypeId);
      const before = machine.state.outputMaterials.length;
      this.apply(
        takeOutputsFromMachineAction(
          machine.state.outputMaterials.slice(
            0,
            handSpaceLeft(this.state.player),
          ),
          machine,
        ),
      );
      if (
        this.machine(machineTypeId).state.outputMaterials.length === before
      ) {
        throw new Error(
          `The ${machineTypeId}'s outputs would not come off — holding a tool?`,
        );
      }
    }
    return this;
  }

  /**
   * Dial a direct-feed machine's settings — the miter saw's cut line and
   * angle, the band saw's fence. These live on the machine rather than on an
   * operation: there's no plan to pick, so `select` is the wrong verb. The
   * stock you set down decides which operation runs.
   */
  setSettings(
    machineTypeId: MachineState["machineTypeId"],
    settings: ParameterValues,
  ): this {
    return this.apply(
      setMachineSettingsAction(this.machine(machineTypeId), settings),
    );
  }

  /**
   * One whole job on a direct-feed machine: dial the settings, set the stock
   * down, hold the trigger, collect at the outfeed. No plan is chosen — which
   * operation runs is inferred from what's on the table.
   */
  feed(
    machineTypeId: MachineState["machineTypeId"],
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
   * One whole job: set the plan, load the stock, run it out, pick it up.
   * The shape almost every step of a chain takes.
   */
  make(
    machineTypeId: MachineState["machineTypeId"],
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

  // ---------------------------------------------------------------------
  // Leaving the shop, spending money, and handing work over. A chain test
  // starts from a fixture that already owns its machines; a playthrough has
  // to buy them, which means these.
  // ---------------------------------------------------------------------

  /**
   * Take the truck out scavenging and sit through the trip, coming home
   * with the haul ferried out of the bed onto the dropoff spot. The loot
   * is rolled up front from the rng; the default always finds two pallets
   * with all eleven deck boards, so sequences can count on the wood.
   */
  scavenge(rng: () => number = () => 0.9): this {
    this.standAtCab();
    this.apply(startScavengingAction(rng));
    if (!this.state.player.away) {
      throw new Error(
        "The scavenging trip would not start — hands full, or mid-trip already",
      );
    }
    this.tick(SCAVENGE_DURATION_TICKS + 1);
    if (this.state.player.away) {
      throw new Error("Still out scavenging after the trip should have ended");
    }
    return this.unloadBed();
  }

  /** Take a trip out to a store, if the truck offers it yet. */
  goShopping(store: StoreId): this {
    if (!storeUnlocked(this.state, store)) {
      throw new Error(
        `The truck doesn't offer ${store} yet — check the progression flags`,
      );
    }
    this.standAtCab();
    return this.apply(goToStoreAction(store));
  }

  /**
   * Come home from a trip and unload the truck: purchases ride in the
   * bed, so pulling in ends with tailgate-to-dropoff trips that stage
   * the stock on the floor — the same walk the player makes. Crated
   * machines stay in the bed until buyAndPlaceMachine lifts them.
   */
  comeHome(): this {
    this.apply(returnFromStoreAction());
    return this.unloadBed();
  }

  /** Stand at the tailgate — the loading side of the parked truck. */
  standAtBed(): this {
    const [doorX] = this.state.shopInfo.entrancePosition;
    return this.standAt([doorX, this.state.shopInfo.size[1] + 1]);
  }

  /**
   * Empty the truck's bed onto the material dropoff spot, an armful at a
   * time — the tailgate-to-floor trips the hand cap makes real. Ends
   * empty-handed, with the haul staged on the floor where `load` and
   * `takeFromFloor` will find it.
   */
  unloadBed(): this {
    if (this.state.truck.bed.length === 0) {
      return this;
    }
    const dropoff = this.state.shopInfo.materialDropoffPosition;
    while (this.state.truck.bed.length > 0) {
      if (handSpaceLeft(this.state.player) === 0) {
        this.standAt(dropoff);
        this.apply(dropMaterialAction(this.inventory));
      }
      this.standAtBed();
      const before = this.state.truck.bed.length;
      this.apply(
        takeFromTruckBedAction(
          this.state.truck.bed.slice(0, handSpaceLeft(this.state.player)),
        ),
      );
      if (this.state.truck.bed.length === before) {
        throw new Error(
          `The bed would not unload — holding a tool, or too far from it`,
        );
      }
    }
    if (this.inventory.length > 0) {
      this.standAt(dropoff);
      this.apply(dropMaterialAction(this.inventory));
    }
    return this;
  }

  /** Buy stock off a rack. The caller names the price the rack charges. */
  buy(material: MaterialInstance, price: number): this {
    const before = this.money;
    this.apply(buyMaterialAction(material, price));
    if (this.money !== before - price) {
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
    if (this.state.reputation < channel.minReputation) {
      throw new Error(
        `The ${channelId} rack needs ${channel.minReputation} reputation and ` +
          `the shop has ${this.state.reputation} — a channel this rung needs ` +
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
  buySheet(kind: SheetGood["kind"]): this {
    const sku = SHEET_SKUS.find((candidate) => candidate.kind === kind);
    if (!sku) {
      throw new Error(`The aisle doesn't stock ${kind}`);
    }
    if (this.state.reputation < sku.minReputation) {
      throw new Error(
        `${kind} needs ${sku.minReputation} reputation and the shop has ` +
          `${this.state.reputation}`,
      );
    }
    const sheet = makeMaterial<SheetGood>({
      type: "plywood",
      kind,
      length: sku.length,
      width: sku.width,
      thickness: sku.thickness,
    });
    return this.buy(sheet, getSheetBuyPrice(sheet));
  }

  /** Buy a pack of supplies (nails, screws, oil). */
  buySupplies(consumableId: ConsumableId): this {
    const before = this.money;
    this.apply(buyConsumablePackAction(consumableId));
    if (this.money === before) {
      throw new Error(`Couldn't afford a pack of ${consumableId}`);
    }
    return this;
  }

  /** Buy a clamp bar. Glue-ups tie clamps up until they've cured. */
  buyClamps(count: number): this {
    for (let i = 0; i < count; i++) {
      const before = this.state.clamps;
      this.apply(buyClampAction());
      if (this.state.clamps === before) {
        throw new Error(`Couldn't afford clamp ${i + 1} of ${count}`);
      }
    }
    return this;
  }

  /** Buy a tool off the tool wall, into storage. Mount it separately. */
  buyTool(toolId: ToolId): this {
    const before = this.state.storage.tools.length;
    this.apply(buyToolAction(toolId));
    if (this.state.storage.tools.length === before) {
      throw new Error(
        `Couldn't afford the ${toolId} — the shop had $${this.money}`,
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
    const before = this.money;
    this.apply(buyMachineAction(machineTypeId, price));
    if (this.money !== before - price) {
      throw new Error(
        `Couldn't afford the ${machineTypeId} at $${price} — the shop had $${before}`,
      );
    }
    const crate = this.state.truck.crates.find(
      (candidate) => candidate.machineTypeId === machineTypeId,
    );
    if (!crate) {
      throw new Error(`No ${machineTypeId} crate arrived in the truck's bed`);
    }
    this.standAtBed().apply(takeCrateFromTruckAction(machineTypeId));
    if (!this.state.player.carriedMachine) {
      throw new Error(
        `Couldn't lift the ${machineTypeId} crate. A crate takes both hands, ` +
          `and the player is holding ` +
          `[${this.inventory.map((m) => m.type).join(", ")}] — ` +
          `putEverythingDown() first.`,
      );
    }
    this.standAt(operatorCell);
    if (!canPutDownCarriedMachine(this.state)) {
      throw new Error(
        `No room to set the ${machineTypeId} down from ${operatorCell} — ` +
          `something already occupies the cells it needs`,
      );
    }
    this.apply(putDownCarriedMachineAction());
    // Out of the crate a powered machine is switched off. Throw the switch
    // here so a rung reads as "buy the saw" rather than "buy the saw, and
    // remember the thing every machine needs".
    if (this.machine(machineTypeId).type.powerSwitch) {
      this.switchOn(machineTypeId);
    }
    return this;
  }

  /** Spend a point in the journal. */
  learn(skillId: SkillId): this {
    const before = this.state.progression.unlockedSkills.length;
    this.apply(spendSkillPointAction(skillId));
    if (this.state.progression.unlockedSkills.length === before) {
      throw new Error(
        `Couldn't learn ${skillId} — ${this.state.progression.skillPoints} ` +
          `points unspent, and its prerequisites may not be met`,
      );
    }
    return this;
  }

  /** Stand at the truck's cab, where trips start and work is driven off. */
  standAtCab(): this {
    return this.standAt(truckCabSideCell(this.state.shopInfo));
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
    if (isOutdoors(this.state.shopInfo, this.state.player.position)) {
      this.standAt(this.state.shopInfo.materialDropoffPosition);
    }
    const held = this.inventory.length;
    this.apply(dropMaterialAction(this.inventory));
    if (this.inventory.length === held) {
      throw new Error(`Couldn't set the carried stock down`);
    }
    return this;
  }

  /**
   * Pick a matching pile back up off the floor, into the arms. The arms
   * hold HAND_CAPACITY pieces, so this refuses a bigger ask outright —
   * ferry with `load`, or take an armful and set it down yourself.
   */
  takeFromFloor(predicate: MaterialPredicate, count?: number): this {
    const matches = this.state.materialPiles.filter((pile) =>
      predicate(pile.material),
    );
    const wanted = count === undefined ? matches : matches.slice(0, count);
    if (wanted.length === 0) {
      throw new Error(
        `Nothing matching on the floor — the piles hold ` +
          `[${this.state.materialPiles.map((p) => p.material.type).join(", ")}]`,
      );
    }
    if (wanted.length > handSpaceLeft(this.state.player)) {
      throw new Error(
        `Wanted ${wanted.length} pieces off the floor with arm room for ` +
          `${handSpaceLeft(this.state.player)} — the hands hold two`,
      );
    }
    // Piles can sit on different cells; take them one cell at a time.
    for (const pile of wanted) {
      this.standAt(pile.position).apply(pickUpMaterialAction([pile]));
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
        const before = this.state.truck.bed.length;
        this.apply(loadTruckBedAction(inHand));
        if (this.state.truck.bed.length !== before + inHand.length) {
          throw new Error(`The bed would not take what's in hand`);
        }
        for (const m of inHand) {
          targets.delete(m);
        }
      }
      const piles = this.state.materialPiles.filter((pile) =>
        targets.has(pile.material),
      );
      if (piles.length === 0) {
        break;
      }
      // Full of stock that isn't going: stage it on the dropoff spot so
      // the arms are free to ferry what is.
      if (handSpaceLeft(this.state.player) === 0) {
        this.standAt(this.state.shopInfo.materialDropoffPosition);
        this.apply(dropMaterialAction(this.inventory));
      }
      for (const pile of piles.slice(
        0,
        handSpaceLeft(this.state.player),
      )) {
        const held = this.inventory.length;
        this.standAt(pile.position).apply(pickUpMaterialAction([pile]));
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
   * Deliver the active commission: gather what the order requires out of
   * the hands and off the floor, ferry it into the bed, walk to the cab,
   * and drive it off. Fails loudly rather than quietly doing nothing,
   * because "the commission silently didn't complete" is the exact bug a
   * playthrough exists to catch.
   */
  handOverCommission(): this {
    const commission = getActiveCommission(this.state.progression);
    if (!commission) {
      throw new Error("No active commission to hand over");
    }
    const before = this.state.progression.commissionsCompleted;
    // Pick exactly the pieces the order's matcher would claim; anything
    // it doesn't want stays in the shop. If what's in reach can't satisfy
    // the order, load the hands anyway and let the delivery fail with its
    // own message naming the bed.
    const candidates = [
      ...this.inventory,
      ...this.state.materialPiles.map((pile) => pile.material),
    ];
    const leftover = consumeRequiredMaterials(
      candidates,
      commission.requiredMaterials,
    );
    if (leftover !== null) {
      const leftoverSet = new Set(leftover);
      this.loadBed(candidates.filter((m) => !leftoverSet.has(m)));
    } else {
      this.loadBed();
    }
    this.standAtCab().apply(completeCommissionAction());
    if (this.state.progression.commissionsCompleted !== before + 1) {
      throw new Error(
        `"${commission.name}" would not deliver. The bed holds ` +
          `[${this.state.truck.bed.map((m) => m.type).join(", ")}], which ` +
          `does not satisfy ${JSON.stringify(commission.requiredMaterials)}`,
      );
    }
    return this.apply(clearPendingPayoutsAction);
  }
}

/** Open a shop from a fixture (or any GameState) and start working it. */
export function openShop(initial: GameState): ShopDriver {
  return new ShopDriver(initial);
}
