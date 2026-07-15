import { MachineType } from "../Machine";

/**
 * The free-selling outbox: materials placed on the table are sold
 * automatically, one per tick, at getSellValue prices (see the sales pass in
 * tickAction). It has no operations — selling is not something the player
 * runs, it just happens.
 */
export const salesTable: MachineType = {
  id: "salesTable",
  name: "Sales Table",
  description:
    "A folding table with a cash box. Anything you set on it gets sold at market prices.",
  cellsOccupied: [[0, 0]],
  freeCellsNeeded: [[0, 1]],
  operationPosition: [0, 1],
  cost: 50,
  materialStorage: 0,
  toolStorage: 0,
  inputSpaces: 5,
  operations: [],
};
