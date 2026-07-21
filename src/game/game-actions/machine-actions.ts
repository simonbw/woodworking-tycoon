import { GameAction, GameState, ProgressionState } from "../GameState";
import {
  isSameMachine,
  Machine,
  MACHINE_TYPES,
  MachineId,
  MachineState,
  MachineType,
} from "../Machine";
import {
  Direction,
  rotateVec,
  scaleVec,
  translateVec,
  Vector,
  vectorEquals,
} from "../Vectors";
import { CellMap } from "../CellMap";
import { defaultParametersFor } from "../operation-helpers";
import { carryingShopVac } from "../ShopVac";
import { emitSound } from "./sound-actions";

/**
 * Validates whether a machine can be placed at the given position and
 * rotation. Benchtop machines (MachineType.benchtop) may land on free
 * worktable cells as well as empty floor; everything else needs bare
 * floor. Free cells (infeed/outfeed/operator) must be genuinely walkable —
 * a table top doesn't count.
 * @param excludeMachine - Optional machine to ignore in collision checks
 * (the machine being moved)
 */
export function canPlaceMachine(
  cellMap: CellMap,
  machineType: MachineType,
  position: Vector,
  rotation: Direction,
  excludeMachine?: MachineState,
): boolean {
  const unlessExcluded = (occupant: Machine | undefined): Machine | undefined =>
    occupant !== undefined &&
    excludeMachine !== undefined &&
    isSameMachine(occupant.state, excludeMachine)
      ? undefined
      : occupant;

  // Check all cells the machine occupies
  for (const relativeCell of machineType.cellsOccupied) {
    const absolutePosition = translateVec(
      rotateVec(relativeCell, rotation),
      position,
    );

    const cell = cellMap.at(absolutePosition);
    if (cell === undefined) {
      return false;
    }

    const top = unlessExcluded(cell.machine);
    const table = unlessExcluded(cell.tableMachine);

    if (machineType.benchtop) {
      // Empty floor, or a worktable cell with nothing mounted on it yet
      if (top !== undefined && !top.type.worktable) {
        return false;
      }
    } else if (top !== undefined || table !== undefined) {
      return false;
    }
  }

  // Check all free cells needed by the machine
  for (const relativeCell of machineType.freeCellsNeeded) {
    const absolutePosition = translateVec(
      rotateVec(relativeCell, rotation),
      position,
    );

    const cell = cellMap.at(absolutePosition);
    if (cell === undefined) {
      return false;
    }

    if (
      unlessExcluded(cell.machine) !== undefined ||
      unlessExcluded(cell.tableMachine) !== undefined
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Gets all cells that would be occupied by a machine at the given position and rotation
 * Useful for highlighting during placement preview
 */
export function getMachineOccupiedCells(
  machineType: MachineType,
  position: Vector,
  rotation: Direction,
): Vector[] {
  return machineType.cellsOccupied.map((relativeCell) =>
    translateVec(rotateVec(relativeCell, rotation), position),
  );
}

/**
 * Gets all free cells needed by a machine at the given position and rotation
 * Useful for highlighting during placement preview
 */
export function getMachineFreeCells(
  machineType: MachineType,
  position: Vector,
  rotation: Direction,
): Vector[] {
  return machineType.freeCellsNeeded.map((relativeCell) =>
    translateVec(rotateVec(relativeCell, rotation), position),
  );
}

/**
 * The benchtop machines sitting on a worktable's cells. A table with
 * machines mounted can't be moved or removed — take the machines off
 * first.
 */
export function machinesMountedOnTable(
  gameState: GameState,
  tableIndex: number,
): ReadonlyArray<MachineState> {
  const table = gameState.machines[tableIndex];
  const tableType = MACHINE_TYPES[table.machineTypeId];
  if (!tableType.worktable) {
    return [];
  }
  const tableCells = getMachineOccupiedCells(
    tableType,
    table.position,
    table.rotation,
  ).map((cell) => cell.join(","));
  return gameState.machines.filter((machine, index) => {
    if (index === tableIndex) {
      return false;
    }
    const machineType = MACHINE_TYPES[machine.machineTypeId];
    return getMachineOccupiedCells(
      machineType,
      machine.position,
      machine.rotation,
    ).some((cell) => tableCells.includes(cell.join(",")));
  });
}

/** A factory-fresh MachineState; defaults to the first UNLOCKED operation. */
export function freshMachineState(
  machineTypeId: MachineId,
  progression: ProgressionState,
): MachineState {
  const machineType = MACHINE_TYPES[machineTypeId];
  const unlockedOps = machineType.operations.filter(
    (op) =>
      !op.requiredSkill || progression.unlockedSkills.includes(op.requiredSkill),
  );
  return {
    machineTypeId,
    position: [0, 0],
    rotation: 0,
    selectedOperationId: unlockedOps.length > 0 ? unlockedOps[0].id : "none",
    // Parameterized defaults up front: an operation started without the
    // player ever touching the scale must still complete cleanly.
    selectedParameters:
      unlockedOps.length > 0
        ? defaultParametersFor(unlockedOps[0])
        : undefined,
    operationProgress: {
      status: "notStarted",
      phaseIndex: 0,
      ticksRemaining: 0,
    },
    inputMaterials: [],
    processingMaterials: [],
    outputMaterials: [],
    tools: [],
    storedMaterials: [],
    upgrades: [],
  };
}

/**
 * Lands a machine crate on the open floor nearest `near` (walkable, no
 * crate there yet), falling back to sharing a cell when the shop is that
 * full. Purchases pass the entrance; build recipes pass the bench.
 */
export function deliverMachineCrate(
  gameState: GameState,
  machine: MachineState,
  near: Vector = gameState.shopInfo.entrancePosition,
): GameState {
  const cellMap = CellMap.fromGameState(gameState);
  const distance = (cell: Vector) =>
    Math.abs(cell[0] - near[0]) + Math.abs(cell[1] - near[1]);
  const openCells = cellMap
    .getFreeCells()
    .map((cell) => cell.position)
    .filter(
      (position) =>
        !gameState.machineCrates.some((crate) =>
          vectorEquals(crate.position, position),
        ),
    )
    .sort((a, b) => distance(a) - distance(b));
  const position = openCells[0] ?? near;
  return {
    ...gameState,
    machineCrates: [...gameState.machineCrates, { machine, position }],
  };
}

/**
 * Per-step busy ticks while lugging a machine. Benchtop machines tuck
 * under an arm; floor machines and benches are a slow shuffle that gets
 * slower the bigger the footprint.
 */
export function carryMoveBusyTicks(machineType: MachineType): number {
  return machineType.benchtop ? 0 : 1 + machineType.cellsOccupied.length;
}

/** The player's hands are genuinely free: no machine, no boards, no vac. */
function handsFree(gameState: GameState): boolean {
  return (
    gameState.player.carriedMachine == null &&
    gameState.player.inventory.length === 0 &&
    !carryingShopVac(gameState)
  );
}

/**
 * Whether the player could hoist this machine right now: hands free, the
 * machine idle and emptied of work materials (shelf stock, mounted tools,
 * and installed upgrades ride along), and no benchtop machines mounted on
 * it if it's a table. Position isn't checked here — the caller picks
 * machines the player is standing at.
 */
export function canPickUpMachine(
  gameState: GameState,
  machineState: MachineState,
): boolean {
  const machineIndex = gameState.machines.findIndex((m) =>
    isSameMachine(m, machineState),
  );
  return (
    handsFree(gameState) &&
    machineIndex !== -1 &&
    machineState.operationProgress.status !== "inProgress" &&
    machineState.inputMaterials.length === 0 &&
    machineState.processingMaterials.length === 0 &&
    machineState.outputMaterials.length === 0 &&
    machinesMountedOnTable(gameState, machineIndex).length === 0
  );
}

/** Hoists a placed machine onto the player's shoulders. */
export function pickUpMachineAction(machineState: MachineState): GameAction {
  return (gameState) => {
    if (!canPickUpMachine(gameState, machineState)) {
      console.warn("Tried to pick up a machine that can't be carried");
      return gameState;
    }
    return emitSound(
      {
        ...gameState,
        machines: gameState.machines.filter(
          (m) => !isSameMachine(m, machineState),
        ),
        player: { ...gameState.player, carriedMachine: machineState },
      },
      { kind: "material-pickup" },
    );
  };
}

/** Unpacks the crate underfoot straight into the player's arms. */
export function pickUpCrateAction(): GameAction {
  return (gameState) => {
    const crate = gameState.machineCrates.find((candidate) =>
      vectorEquals(candidate.position, gameState.player.position),
    );
    if (!crate || !handsFree(gameState)) {
      console.warn("No crate underfoot, or hands are full");
      return gameState;
    }
    return emitSound(
      {
        ...gameState,
        machineCrates: gameState.machineCrates.filter(
          (candidate) => candidate !== crate,
        ),
        player: { ...gameState.player, carriedMachine: crate.machine },
      },
      { kind: "material-pickup" },
    );
  };
}

/**
 * Where the carried machine would land if set down right now: anchored so
 * the player is standing at its operator cell — you place a machine by
 * standing where you'd work it, which guarantees the operator cell is
 * genuinely reachable. Machines with no operator cell (the garbage can)
 * land on the cell the player faces instead.
 */
export function carriedMachinePlacement(
  gameState: GameState,
): { machineType: MachineType; position: Vector; rotation: Direction } | null {
  const carried = gameState.player.carriedMachine;
  if (!carried) {
    return null;
  }
  const machineType = MACHINE_TYPES[carried.machineTypeId];
  const rotation = carried.rotation;
  const position = machineType.operationPosition
    ? translateVec(
        gameState.player.position,
        scaleVec(rotateVec(machineType.operationPosition, rotation), -1),
      )
    : translateVec(
        gameState.player.position,
        rotateVec([1, 0], gameState.player.direction),
      );
  return { machineType, position, rotation };
}

/** Whether the carried machine fits where it would land right now. */
export function canPutDownCarriedMachine(gameState: GameState): boolean {
  const placement = carriedMachinePlacement(gameState);
  if (!placement) {
    return false;
  }
  const { machineType, position, rotation } = placement;
  const occupied = getMachineOccupiedCells(machineType, position, rotation);
  return (
    !occupied.some((cell) => vectorEquals(cell, gameState.player.position)) &&
    canPlaceMachine(
      CellMap.fromGameState(gameState),
      machineType,
      position,
      rotation,
    )
  );
}

/** Sets the carried machine down with its operator cell underfoot. */
export function putDownCarriedMachineAction(): GameAction {
  return (gameState) => {
    const carried = gameState.player.carriedMachine;
    if (!carried || !canPutDownCarriedMachine(gameState)) {
      console.warn("No room to set the machine down here");
      return gameState;
    }
    const { position, rotation } = carriedMachinePlacement(gameState)!;
    return emitSound(
      {
        ...gameState,
        machines: [...gameState.machines, { ...carried, position, rotation }],
        player: { ...gameState.player, carriedMachine: null },
      },
      { kind: "material-drop" },
    );
  };
}

/** Spins the carried machine a quarter turn around the player. */
export function rotateCarriedMachineAction(): GameAction {
  return (gameState) => {
    const carried = gameState.player.carriedMachine;
    if (!carried) {
      return gameState;
    }
    return {
      ...gameState,
      player: {
        ...gameState.player,
        carriedMachine: {
          ...carried,
          rotation: ((carried.rotation + 1) % 4) as Direction,
        },
      },
    };
  };
}
