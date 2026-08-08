import { CellMap } from "./CellMap";
import { GameState } from "./GameState";
import { Machine } from "./Machine";
import { rotateVec, translateVec, Vector } from "./Vectors";

/**
 * Where a benchtop machine sits, and what it costs to leave it on the
 * floor.
 *
 * A benchtop machine (MachineType.benchtop — the lunchbox planer, jointer,
 * jobsite table saw, miter saw) is built to live on a bench: its table is
 * knee-high on the ground, so you feed it stooped over and fight the stock
 * the whole way. It still works, it just works badly. Mounted on a
 * worktable it runs at the duration its operations declare; on the floor
 * every attended phase takes FLOOR_WORK_PENALTY times as long.
 *
 * The penalty is binary — a machine is either up on a table or it isn't.
 * The table's own workSpeed and its upgrades stay out of it: a vise and a
 * drawer of chisels have no business speeding up a planer, and they
 * already pay for themselves in the hand work the table does host.
 *
 * "Mounted" means every cell the machine occupies has a worktable under
 * it. Placement (canPlaceMachine) checks table-vs-floor per cell, so a
 * wide machine can technically straddle a table's edge; a machine with one
 * foot on the ground is not mounted.
 */
export const FLOOR_WORK_PENALTY = 2;

/**
 * Whether this placed machine is sitting on a worktable. False for
 * anything that isn't a benchtop machine — a floor-standing band saw is
 * exactly where it belongs.
 */
export function isMountedOnWorktable(
  machine: Machine,
  gameState: GameState,
): boolean {
  if (!machine.type.benchtop) {
    return false;
  }
  const cellMap = CellMap.fromGameState(gameState);
  return machine.type.cellsOccupied.every((relativeCell) => {
    const position: Vector = translateVec(
      rotateVec(relativeCell, machine.rotation),
      machine.position,
    );
    return cellMap.at(position)?.tableMachine !== undefined;
  });
}

/**
 * Whether this machine is a benchtop machine left on the shop floor —
 * the state the penalty applies to, and the one the UI calls out.
 */
export function isBenchtopOnFloor(
  machine: Machine,
  gameState: GameState,
): boolean {
  return (
    Boolean(machine.type.benchtop) && !isMountedOnWorktable(machine, gameState)
  );
}

/**
 * The work speed to run this station's attended phases at: the machine's
 * own effective speed (type base × installed upgrades), halved when it's a
 * benchtop machine still on the floor. Everything that turns an operation
 * into ticks should read speed through here rather than off
 * `Machine.workSpeed`, the way dust slowdown comes through
 * machineDustMultiplier.
 */
export function stationWorkSpeed(
  machine: Machine,
  gameState: GameState,
): number {
  return isBenchtopOnFloor(machine, gameState)
    ? machine.workSpeed / FLOOR_WORK_PENALTY
    : machine.workSpeed;
}
