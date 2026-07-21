import { BOARD_DIMENSIONS, Board, BoardDimension, Panel } from "../Materials";
import { isBoard } from "../board-helpers";
import { isPanel } from "../panel-helpers";
import { makeMaterial } from "../material-helpers";
import { MachineType, ParameterizedOperation } from "../Machine";

export const lunchboxPlaner: MachineType = {
  id: "planer",
  name: "Planer",
  description: "A lunchbox planer",
  cellsOccupied: [[0, 0]],
  // Feed-through: room to stand at the infeed and to catch stock at the
  // outfeed — a planer can't back onto a wall
  freeCellsNeeded: [
    [0, 1],
    [0, -1],
  ],
  operationPosition: [0, 1],
  outputPosition: [0, -1],
  cost: 450,
  materialStorage: 0,
  toolSlots: 1,
  inputSpaces: 1,
  // Small enough to mount on a worktable cell instead of the floor
  benchtop: true,
  operations: [
    {
      id: "planeBoard",
      requiredSkill: "basicMilling",
      name: "Plane Board",
      duration: 15,
      dustOutput: 2,
      parameters: [
        {
          id: "targetThickness",
          name: "Target Thickness",
          values: BOARD_DIMENSIONS,
          unit: "/4",
        },
      ],
      getInputMaterials: (params) => {
        const targetThickness = params.targetThickness as BoardDimension;
        // Equal thickness is a skim pass: rough stock carries sacrificial
        // material beyond its nominal size, so milling never shrinks the
        // listed dimensions.
        const validThicknesses = BOARD_DIMENSIONS.filter(
          (d) => d >= targetThickness,
        );
        return [
          {
            type: ["board"],
            thickness: validThicknesses,
            // A planer needs a flat reference face — it can't fix warp,
            // only copy flatness to the other side. Joint a face first.
            jointedFaces: [1, 2],
            quantity: 1,
          },
        ];
      },
      output: (materials, params) => {
        const inputBoard = materials[0];
        if (!isBoard(inputBoard)) {
          throw new Error("Input material is not a board");
        }
        const targetThickness = params.targetThickness as BoardDimension;
        // Thinner, faces parallel, and freshly surfaced (but only sanding
        // reaches "sanded")
        return {
          inputs: [],
          outputs: [
            makeMaterial<Board>({
              ...inputBoard,
              thickness: targetThickness,
              jointedFaces: 2,
              surface: "smooth",
            }),
          ],
        };
      },
    } as ParameterizedOperation,
    {
      id: "planePanel",
      requiredSkill: "basicMilling",
      name: "Plane Panel",
      duration: 15,
      dustOutput: 2,
      parameters: [
        {
          id: "targetThickness",
          name: "Target Thickness",
          values: BOARD_DIMENSIONS,
          unit: "/4",
        },
      ],
      getInputMaterials: (params) => {
        const targetThickness = params.targetThickness as BoardDimension;
        // Equal thickness is a skim pass — glue squeeze-out and alignment
        // ridges are sacrificial, same as rough stock's extra material.
        const validThicknesses = BOARD_DIMENSIONS.filter(
          (d) => d >= targetThickness,
        );
        return [
          {
            type: ["panel"],
            thickness: validThicknesses,
            quantity: 1,
            // Never feed end grain into a planer — it tears out in chunks.
            // Sanding is the only way to flatten an end-grain panel.
            matches: (material) =>
              isPanel(material) && material.grain !== "end",
          },
        ];
      },
      output: (materials, params) => {
        const inputPanel = materials[0];
        if (!isPanel(inputPanel)) {
          throw new Error("Input material is not a panel");
        }
        const targetThickness = params.targetThickness as BoardDimension;
        // Thinner, and freshly surfaced (but only sanding reaches "sanded")
        return {
          inputs: [],
          outputs: [
            makeMaterial<Panel>({
              ...inputPanel,
              thickness: targetThickness,
              surface: "smooth",
            }),
          ],
        };
      },
    } as ParameterizedOperation,
  ],
};
