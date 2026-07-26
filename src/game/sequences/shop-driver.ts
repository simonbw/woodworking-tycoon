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
  getMachines,
} from "../Machine";
import { GameAction, GameState } from "../GameState";
import { MaterialInstance } from "../Materials";
import { availableOperations } from "../skill-helpers";
import { tickAction } from "../game-actions/tickAction";
import {
  moveMaterialsToMachineAction,
  operateMachineAction,
  setMachineOperationAction,
  setOperatingAction,
  setPlayerPositionAction,
  takeOutputsFromMachineAction,
} from "../game-actions/player-actions";
import { mountToolAction } from "../game-actions/tool-actions";
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

  /** The one thing in hand that matches, or a failure naming what's there. */
  theOne(predicate: MaterialPredicate): MaterialInstance {
    const matches = this.holding(predicate);
    if (matches.length !== 1) {
      throw new Error(
        `Expected exactly one matching material in hand, found ${matches.length}` +
          ` among [${this.inventory.map((m) => m.type).join(", ")}]`,
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

  /** Bolt a tool from storage onto the station. */
  mount(
    machineTypeId: MachineState["machineTypeId"],
    toolId: ToolId,
  ): this {
    return this.apply(mountToolAction(this.machine(machineTypeId), toolId));
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

  /** Set the station's plan. */
  select(
    machineTypeId: MachineState["machineTypeId"],
    operationId: string,
  ): this {
    return this.apply(
      setMachineOperationAction(
        this.machine(machineTypeId),
        this.operation(machineTypeId, operationId),
      ),
    );
  }

  /**
   * Carry the matching stock from hand onto the station. `count` takes only
   * the first so many matches, for recipes that want two of one board and
   * three of another out of a pile of both.
   *
   * The move is checked rather than assumed: a bay with fewer free spaces
   * than the load needs refuses the whole thing and warns, which downstream
   * looks like a station that won't start for no reason.
   */
  load(
    machineTypeId: MachineState["machineTypeId"],
    predicate: MaterialPredicate,
    count?: number,
  ): this {
    const matches = this.holding(predicate);
    const materials = count === undefined ? matches : matches.slice(0, count);
    if (materials.length === 0) {
      throw new Error(
        `Nothing in hand to load onto the ${machineTypeId} — holding ` +
          `[${this.inventory.map((m) => m.type).join(", ")}]`,
      );
    }
    if (count !== undefined && materials.length < count) {
      throw new Error(
        `Wanted ${count} matching pieces for the ${machineTypeId}, ` +
          `only ${materials.length} in hand`,
      );
    }
    const before = this.machine(machineTypeId).state.inputMaterials.length;
    this.apply(
      moveMaterialsToMachineAction(materials, this.machine(machineTypeId)),
    );
    const after = this.machine(machineTypeId).state.inputMaterials.length;
    if (after !== before + materials.length) {
      throw new Error(
        `The ${machineTypeId} would not take ${materials.length} more ` +
          `pieces — its bay holds ${this.machine(machineTypeId).type.inputSpaces} ` +
          `and already had ${before}. Load only what the recipe wants.`,
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
   * player has to.
   */
  collect(machineTypeId: MachineState["machineTypeId"]): this {
    const outfeed = this.machine(machineTypeId).absoluteOutputPosition;
    if (outfeed) {
      this.standAt(outfeed);
    }
    const machine = this.machine(machineTypeId);
    return this.apply(
      takeOutputsFromMachineAction(machine.state.outputMaterials, machine),
    );
  }

  /**
   * One whole job: set the plan, load the stock, run it out, pick it up.
   * The shape almost every step of a chain takes.
   */
  make(
    machineTypeId: MachineState["machineTypeId"],
    operationId: string,
    stock: MaterialPredicate,
  ): this {
    return this.standAtOperatorCell(machineTypeId)
      .select(machineTypeId, operationId)
      .load(machineTypeId, stock)
      .run(machineTypeId)
      .collect(machineTypeId);
  }
}

/** Open a shop from a fixture (or any GameState) and start working it. */
export function openShop(initial: GameState): ShopDriver {
  return new ShopDriver(initial);
}
