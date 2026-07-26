import { MachineType } from "../Machine";

/** How much the can swallows before it has to go out to the curb. */
export const GARBAGE_CAN_CAPACITY = 8;

/**
 * The shop can: an inventory you toss offcuts into, not an incinerator.
 * Anything in it is still yours — take it back out until you haul the
 * bag to the curb, which is the Empty operation. Emptying goes a piece
 * at a time, so a full can costs more of a hold than a single offcut.
 */
export const garbageCan: MachineType = {
  id: "garbageCan",
  name: "Garbage Can",
  description:
    "Toss offcuts in and take them back out. Emptying it is permanent.",
  // A full-size shop can (22" across) sits on a 2×2-ft patch of floor.
  cellsOccupied: [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ],
  // Hand-set (the can is drawn procedurally, not from an image): the lid
  // circle in GarbageCanSprite is 0.93 cells around the footprint center.
  collisionBox: { min: [-0.43, -0.43], max: [1.43, 1.43] },
  freeCellsNeeded: [],
  // No front: you reach in from whichever side you walked up on.
  operableFromAnySide: true,
  container: true,
  cost: 0, // Free - basic quality of life feature
  materialStorage: 0,
  toolSlots: 0,
  inputSpaces: GARBAGE_CAN_CAPACITY,
  feedVerb: "empty",
  stageVerb: "toss in",
  operations: [
    {
      name: "Empty",
      id: "empty",
      // Long enough to feel like a trip to the curb, short enough that
      // clearing a full can is a held key rather than a chore.
      duration: 2,
      // One piece at a time: the hold empties the can as long as you keep
      // holding it, and letting go leaves the rest where it is.
      getInputMaterials: () => [{ quantity: 1 }],
      output: () => ({ inputs: [], outputs: [] }),
    },
  ],
};
