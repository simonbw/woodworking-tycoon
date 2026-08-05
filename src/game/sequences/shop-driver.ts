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
  InputMaterialWithQuantity,
  Machine,
  MachineState,
  Operation,
  ParameterValues,
  getMachines,
} from "../Machine";
import { GameAction, GameState } from "../GameState";
import { MaterialInstance, panelWidth } from "../Materials";
import { HAND_CAPACITY, handSpaceLeft } from "../Person";
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
  takeInputsFromMachineAction,
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
  arrangeBenchMaterialAction,
  finishAttendedWorkAction,
  palletPryTargetsLeft,
  pryPalletNailAction,
  startGlueUpAction,
} from "../game-actions/operation-actions";
import { benchTopSizeIn } from "../bench-work/bench-layout";
import {
  loadTruckBedAction,
  takeCrateFromTruckAction,
  takeFromTruckBedAction,
} from "../game-actions/truck-actions";
import { isOutdoors, truckCabSideCell } from "../lot";
import { motionCell } from "../player-motion";
import { MaterialPile } from "../GameState";
import {
  goHomeAction,
  goToStoreAction,
  returnFromStoreAction,
  storeUnlocked,
  wakeUpAction,
} from "../game-actions/door-actions";
import { isNight } from "../time-flow";
import {
  SCAVENGE_DURATION_TICKS,
  startScavengingAction,
} from "../game-actions/scavenge-actions";
import { clearPendingPayoutsAction } from "../game-actions/payout-actions";
import { spendSkillPointAction } from "../game-actions/skill-actions";
import {
  acceptJobAction,
  deliverJobAction,
  listItemAction,
} from "../game-actions/marketplace-actions";
import { generateJobBoard } from "../job-generation";
import { LISTING_PITY_TICKS } from "../marketplace";
import { getActiveCommission } from "../commissionSequence";
import { board } from "../board-helpers";
import { LUMBER_CHANNELS } from "../lumberStock";
import {
  getBoardBuyPrice,
  getSellValue,
  getSheetBuyPrice,
} from "../material-values";
import { SHEET_SKUS } from "../sheetStock";
import { makeMaterial } from "../material-helpers";
import { Board, SheetGood, ToolItem } from "../Materials";
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
   * piled on the floor. The hands hold HAND_CAPACITY pieces, so a
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
   * Walk to a pile. Piles rest at continuous positions, not on cells —
   * standing in the cell under the piece's center is always within reach
   * (see pileWithinReach).
   */
  standNear(pile: MaterialPile): this {
    return this.standAt(motionCell(pile.position));
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
   * Bolt a tool onto the station. Tools are physical things, so the tool
   * is fetched from wherever it's resting first — the arms, a floor pile,
   * or the truck's bed — the same trips a player makes. A bench has a
   * fixed number of slots, so this fails rather than silently doing
   * nothing when they're all taken — unmount something, or build a
   * worktable.
   */
  mount(machineTypeId: MachineState["machineTypeId"], toolId: ToolId): this {
    if (this.machine(machineTypeId).state.tools.includes(toolId)) {
      return this;
    }
    const tool = this.fetchTool(toolId);
    this.apply(mountToolAction(this.machine(machineTypeId), tool));
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
    if (handSpaceLeft(this.state.player) === 0) {
      this.standAt(this.state.shopInfo.materialDropoffPosition);
      this.apply(dropMaterialAction(this.inventory));
    }
    const pile = this.state.materialPiles.find((candidate) =>
      isTheTool(candidate.material),
    );
    if (pile) {
      this.standNear(pile).apply(pickUpMaterialAction([pile]));
    } else {
      const inBed = this.state.truck.bed.find(isTheTool);
      if (inBed) {
        this.standAtBed().apply(takeFromTruckBedAction([inBed]));
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
  unmount(machineTypeId: MachineState["machineTypeId"], toolId: ToolId): this {
    // The tool comes off into the arms, so make sure they have room
    if (handSpaceLeft(this.state.player) === 0) {
      this.standAt(this.state.shopInfo.materialDropoffPosition);
      this.apply(dropMaterialAction(this.inventory));
    }
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
            .join(
              ", ",
            )}]. A locked skill or an unmounted tool is the usual cause.`,
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
    const spaces = this.machine(machineTypeId).type.inputSpaces - before;
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
      for (const pile of piles.slice(0, handSpaceLeft(this.state.player))) {
        const held = this.inventory.length;
        this.standNear(pile).apply(pickUpMaterialAction([pile]));
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
   * Start the station and stay on it until the work is done. For legacy
   * operations that means holding the operate key through the ticks. For
   * interactive operations (the bench view's hand work) the driver
   * commits through the SAME actions the mini-game commits through —
   * start, then `finishAttendedWorkAction` — with no mini-game in
   * between; there is nothing else it could legally hold. Either way,
   * hands-free phases (glue curing) run out on the clock, so one verb
   * covers both halves of a glue-up.
   */
  run(machineTypeId: MachineState["machineTypeId"]): this {
    // Dismantling never "runs": a staged pallet transforms nail by nail
    // through incremental commits — no plan is ever selected for it — so
    // one run() is one whole teardown.
    const selected = this.machine(machineTypeId).selectedOperationOrNull;
    if (this.offersPry(machineTypeId)) {
      return this.performWork(machineTypeId);
    }

    // Nothing new starts at night; a long sequence sleeps through to
    // morning and picks the work back up.
    this.ensureDaylight();
    this.apply(operateMachineAction(this.machine(machineTypeId)));
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
   * Complete a station's interactive hand work through the real commit
   * actions — the same ones the bench view dispatches, with no mini-game
   * in between. Assumes the operation is already started (run() does
   * that) except for pry work, which never starts an operation at all:
   * a staged pallet is torn down pull by pull. Ends by ticking out any
   * hands-free remainder (a glue-up's cure).
   */
  performWork(machineTypeId: MachineState["machineTypeId"]): this {
    const machine = this.machine(machineTypeId);
    if (this.offersPry(machineTypeId)) {
      let pulls = palletPryTargetsLeft(machine);
      if (pulls === 0) {
        throw new Error(
          `Nothing on the ${machineTypeId} to pry — stage a pallet first`,
        );
      }
      while (pulls > 0) {
        this.apply(pryPalletNailAction(this.machine(machineTypeId)));
        const left = palletPryTargetsLeft(this.machine(machineTypeId));
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
    this.apply(finishAttendedWorkAction(this.machine(machineTypeId)));
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
        `ticks. finishAttendedWorkAction refusing (player not at the ` +
        `station?) is the usual cause.`,
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
      if (this.machine(machineTypeId).state.outputMaterials.length === before) {
        throw new Error(
          `The ${machineTypeId}'s outputs would not come off — holding a tool?`,
        );
      }
    }
    return this;
  }

  /**
   * Clear the loose stock lying on a bench back into the arms — a
   * teardown's freed boards live in the input bay (they stay on the bench,
   * see pryPalletNailAction), so collect() never sees them. An armful at a
   * time, dropping what doesn't fit at the feet, exactly like collect().
   */
  takeStock(machineTypeId: MachineState["machineTypeId"]): this {
    while (this.machine(machineTypeId).state.inputMaterials.length > 0) {
      if (handSpaceLeft(this.state.player) === 0) {
        const held = this.inventory.length;
        this.apply(dropMaterialAction(this.inventory));
        if (this.inventory.length === held) {
          throw new Error(
            `Couldn't set stock down while clearing the ${machineTypeId}`,
          );
        }
        continue;
      }
      const machine = this.machine(machineTypeId);
      const before = machine.state.inputMaterials.length;
      this.apply(
        takeInputsFromMachineAction(
          machine.state.inputMaterials.slice(
            0,
            handSpaceLeft(this.state.player),
          ),
          machine,
        ),
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
   * Whether the station's bench view would be offering pry work right
   * now: idle, a pallet staged, dismantling known. Mirrors
   * benchScriptFor's pallet-wins rule — no plan selection involved.
   */
  private offersPry(machineTypeId: MachineState["machineTypeId"]): boolean {
    const machine = this.machine(machineTypeId);
    return (
      machine.operationProgress.status !== "inProgress" &&
      palletPryTargetsLeft(machine) > 0 &&
      availableOperations(machine, this.state.progression).some(
        (op) => op.interaction?.kind === "pry",
      )
    );
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
   * One whole clamps-first glue-up — no plan, exactly like the bench
   * view: the matching staged stock is laid edge to edge across the
   * bench (real arrange commits, so the run detection sees what a
   * player's drags would leave), the tighten claims it through
   * startGlueUpAction — the composition decides which recipe is
   * credited — and the cure runs out on the clock. Pieces glue in
   * staged order; there is no count because the run takes whatever
   * matches, two or more.
   */
  glueUp(
    machineTypeId: MachineState["machineTypeId"],
    stock?: MaterialPredicate,
  ): this {
    this.standAtOperatorCell(machineTypeId);
    const machine = this.machine(machineTypeId);
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
      this.apply(
        arrangeBenchMaterialAction(this.machine(machineTypeId), piece.id, {
          xIn: bench.widthIn / 2 + across + widthOf(piece) / 2,
          yIn: bench.heightIn / 2,
          angleDeg: 0,
          flipped: false,
        }),
      );
      across += widthOf(piece);
    }
    this.apply(
      startGlueUpAction(
        this.machine(machineTypeId),
        pieces.map((piece) => piece.id),
      ),
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
   * Call it a day the way the player does: walk to the cab, drive home,
   * and wake up the next morning — the overnight runs as one batch of
   * ordinary ticks (cures finish, listings roll, the job board rotates).
   */
  sleep(): this {
    this.standAtCab();
    this.apply(goHomeAction());
    if (this.state.player.away?.kind !== "home") {
      throw new Error(
        "The drive home would not start — hands full, or mid-trip already",
      );
    }
    const before = this.state.day;
    this.apply(wakeUpAction());
    if (this.state.player.away || this.state.day !== before + 1) {
      throw new Error("Morning never came — this is a driver bug");
    }
    return this;
  }

  /**
   * Sleep off the night if the shop has closed, putting the body back
   * where it stood. Every verb that *starts* something time-shaped runs
   * through this, so a long sequence rolls through its days the way a
   * player does — nothing new starts at night, but nobody wants a test
   * to fail over it either.
   */
  private ensureDaylight(): this {
    if (!isNight(this.state)) {
      return this;
    }
    const [x, y] = this.state.player.position;
    this.sleep();
    return this.standAt([x, y]);
  }

  /**
   * Take the truck out scavenging and sit through the trip, coming home
   * with the haul ferried out of the bed onto the dropoff spot. The loot
   * is rolled up front from the rng; the default always finds two pallets
   * with all eleven deck boards, so sequences can count on the wood.
   */
  scavenge(rng: () => number = () => 0.9): this {
    this.ensureDaylight();
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
    this.ensureDaylight();
    this.standAtCab();
    this.apply(goToStoreAction(store));
    if (this.state.player.away?.kind !== "shopping") {
      throw new Error(
        `The trip to ${store} would not start — hands full, or mid-trip already`,
      );
    }
    return this;
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

  /**
   * Buy a tool off the tool wall. It lands in the truck's bed like any
   * other purchase; mount it separately.
   */
  buyTool(toolId: ToolId): this {
    const before = this.state.truck.bed.length;
    this.apply(buyToolAction(toolId));
    if (this.state.truck.bed.length === before) {
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
   * Pick a matching pile back up off the floor, into the arms. This
   * refuses an ask bigger than the arm room outright — ferry with
   * `load`, or take an armful and set it down yourself.
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
          `${handSpaceLeft(this.state.player)} — the hands hold ${HAND_CAPACITY}`,
      );
    }
    // Piles can sit on different cells; take them one cell at a time.
    for (const pile of wanted) {
      this.standNear(pile).apply(pickUpMaterialAction([pile]));
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
      for (const pile of piles.slice(0, handSpaceLeft(this.state.player))) {
        const held = this.inventory.length;
        this.standNear(pile).apply(pickUpMaterialAction([pile]));
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
   * Ferry what an order requires into the bed: exactly the pieces its
   * matcher would claim, out of the hands and off the floor. Anything the
   * order doesn't want stays in the shop. If what's in reach can't
   * satisfy it, the hands are loaded anyway so the delivery fails with
   * its own message naming the bed.
   */
  private loadBedFor(
    requiredMaterials: ReadonlyArray<InputMaterialWithQuantity>,
  ): this {
    const candidates = [
      ...this.inventory,
      ...this.state.materialPiles.map((pile) => pile.material),
    ];
    const leftover = consumeRequiredMaterials(candidates, requiredMaterials);
    if (leftover !== null) {
      const leftoverSet = new Set(leftover);
      return this.loadBed(candidates.filter((m) => !leftoverSet.has(m)));
    }
    return this.loadBed();
  }

  /**
   * Deliver the active commission: gather what the order requires, ferry
   * it into the bed, walk to the cab, and drive it off. Fails loudly
   * rather than quietly doing nothing, because "the commission silently
   * didn't complete" is the exact bug a playthrough exists to catch.
   */
  handOverCommission(): this {
    const commission = getActiveCommission(this.state.progression);
    if (!commission) {
      throw new Error(
        "No active commission to hand over — the phone hasn't rung yet " +
          `(${this.state.reputation} reputation, ` +
          `${this.state.progression.commissionsCompleted} completed)`,
      );
    }
    const before = this.state.progression.commissionsCompleted;
    this.loadBedFor(commission.requiredMaterials);
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

  // ---------------------------------------------------------------------
  // The marketplace: the living between commissions. Jobs and listings
  // are where reputation and money come from while the phone is quiet.
  // ---------------------------------------------------------------------

  /**
   * Put a fresh set of offers on the job board, rolling the same
   * generator the daily refresh rolls — just with a chosen rng, so a
   * sequence gets a board it can count on. Everything after this (accept,
   * build, deliver) goes through the real actions.
   */
  seedJobBoard(rng: () => number = () => 0): this {
    return this.arrange((state) => ({
      ...state,
      jobBoard: generateJobBoard(state, rng),
    }));
  }

  /** Accept an open offer off the board, if a job slot is free. */
  acceptJob(offerId: string): this {
    const before = this.state.acceptedJobs.length;
    this.apply(acceptJobAction(offerId));
    if (this.state.acceptedJobs.length !== before + 1) {
      throw new Error(
        `Couldn't accept job ${offerId} — the board holds ` +
          `[${this.state.jobBoard.map((o) => o.id).join(", ")}] and ` +
          `${before} accepted jobs are using the slots`,
      );
    }
    return this;
  }

  /**
   * Deliver an accepted job at the cab, the same drive a commission
   * takes: gather its requirements into the bed and drive them off.
   */
  deliverJob(jobId: string): this {
    const job = this.state.acceptedJobs.find(
      (candidate) => candidate.id === jobId,
    );
    if (!job) {
      throw new Error(
        `No accepted job ${jobId} — accepted ` +
          `[${this.state.acceptedJobs.map((j) => j.id).join(", ")}]`,
      );
    }
    const before = this.state.acceptedJobs.length;
    this.loadBedFor(job.requiredMaterials);
    this.standAtCab().apply(deliverJobAction(jobId));
    if (this.state.acceptedJobs.length !== before - 1) {
      throw new Error(
        `Job "${job.description}" would not deliver. The bed holds ` +
          `[${this.state.truck.bed.map((m) => m.type).join(", ")}], which ` +
          `does not satisfy ${JSON.stringify(job.requiredMaterials)}`,
      );
    }
    return this.apply(clearPendingPayoutsAction);
  }

  /**
   * Put everything matching up for sale on the phone, at fair value
   * unless the caller prices it otherwise. Fair-priced listings are
   * guaranteed money: if no buyer rolls sooner, the pity timer sells
   * them at two days (see awaitListingSales).
   */
  list(
    predicate: MaterialPredicate,
    price: (material: MaterialInstance) => number = getSellValue,
  ): this {
    const count = this.stock(predicate).length;
    if (count === 0) {
      throw new Error(
        `Nothing in reach to list — holding ` +
          `[${this.inventory.map((m) => m.type).join(", ")}], floor has ` +
          `[${this.state.materialPiles.map((p) => p.material.type).join(", ")}]`,
      );
    }
    const before = this.state.listings.length;
    // Listing takes the item out of the hands, so the arms never fill up;
    // floor stock is picked up a piece at a time on the way to the phone.
    while (this.stock(predicate).length > 0) {
      const inHand = this.inventory.find(predicate);
      if (inHand) {
        this.apply(listItemAction(inHand, price(inHand)));
        if (this.inventory.includes(inHand)) {
          throw new Error(`Couldn't list ${inHand.type}`);
        }
        continue;
      }
      this.takeFromFloor(predicate, 1);
    }
    if (this.state.listings.length !== before + count) {
      throw new Error(
        `Listed ${this.state.listings.length - before} of ${count} pieces — ` +
          `this is a driver bug`,
      );
    }
    return this;
  }

  /**
   * Let the clock run until every listing has sold. Fair-priced listings
   * are guaranteed out by the pity timer at two days; anything still up
   * after that was overpriced, and this fails naming it.
   */
  awaitListingSales(): this {
    const ceiling = LISTING_PITY_TICKS + 100;
    for (let i = 0; i < ceiling && this.state.listings.length > 0; i += 25) {
      this.tick(25);
    }
    if (this.state.listings.length > 0) {
      throw new Error(
        `${this.state.listings.length} listings never sold — asking above ` +
          `fair value? Still up: ` +
          `[${this.state.listings
            .map((l) => `${l.material.type} at $${l.askingPrice}`)
            .join(", ")}]`,
      );
    }
    return this;
  }
}

/** Open a shop from a fixture (or any GameState) and start working it. */
export function openShop(initial: GameState): ShopDriver {
  return new ShopDriver(initial);
}
