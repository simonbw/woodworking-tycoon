import {
  InputMaterialWithQuantity,
  MachineOperation,
  OperationOutput,
  ParameterizedOperation,
  ParameterValues,
} from "./Machine";
import {
  MaterialInstance,
  Board,
  Pallet,
  SheetGood,
  FinishedProduct,
  BoardDimension,
  Species,
} from "./Materials";
import { makeMaterial } from "./material-helpers";

/**
 * Type guard to check if an operation is parameterized
 */
export function isParameterizedOperation(
  operation: MachineOperation | ParameterizedOperation,
): operation is ParameterizedOperation {
  return "parameters" in operation && "getInputMaterials" in operation;
}

/**
 * Get input materials for an operation, handling both regular and parameterized operations
 */
export function getOperationInputMaterials(
  operation: MachineOperation | ParameterizedOperation,
  params?: ParameterValues,
): ReadonlyArray<InputMaterialWithQuantity> {
  if (isParameterizedOperation(operation)) {
    if (!params) {
      // Return requirements for first parameter value as default
      const defaultParams: ParameterValues = {};
      for (const param of operation.parameters) {
        defaultParams[param.id] = param.values[0];
      }
      return operation.getInputMaterials(defaultParams);
    }
    return operation.getInputMaterials(params);
  } else {
    return operation.inputMaterials;
  }
}

/**
 * Execute an operation, handling both regular and parameterized operations
 */
export function executeOperation(
  operation: MachineOperation | ParameterizedOperation,
  materials: ReadonlyArray<MaterialInstance>,
  params?: ParameterValues,
): OperationOutput {
  if (isParameterizedOperation(operation)) {
    if (!params) {
      throw new Error("Parameters required for parameterized operation");
    }
    return operation.output(materials, params);
  } else {
    return operation.output(materials);
  }
}

/**
 * Generates mock materials that satisfy the given input requirements.
 * Used for previewing what an operation will produce.
 */
export function generateMockMaterials(
  requirements: ReadonlyArray<InputMaterialWithQuantity>,
): MaterialInstance[] {
  const results: MaterialInstance[] = [];

  for (const req of requirements) {
    for (let i = 0; i < req.quantity; i++) {
      results.push(generateSingleMockMaterial(req));
    }
  }

  return results;
}

function generateSingleMockMaterial(
  req: InputMaterialWithQuantity,
): MaterialInstance {
  // Determine material type
  const materialType = req.type?.[0] || "board";

  switch (materialType) {
    case "board": {
      const reqAny = req as any; // Cast to access optional properties
      const board: Board = makeMaterial<Board>({
        type: "board",
        // Use first valid value from constraints, or sensible defaults
        length: (reqAny.length?.[0] || 8) as BoardDimension,
        width: (reqAny.width?.[0] || 4) as BoardDimension,
        thickness: (reqAny.thickness?.[0] || 2) as BoardDimension,
        species: (reqAny.species?.[0] || "pine") as Species,
      });
      return board;
    }

    case "pallet": {
      const pallet: Pallet = makeMaterial<Pallet>({
        type: "pallet",
        deckBoards: [
          true,
          true,
          true,
          true,
          true,
          true,
          true,
          true,
          true,
          true,
          true,
        ],
        stringerBoardsLeft: 3,
      });
      return pallet;
    }

    case "plywood": {
      const reqAny = req as any;
      const sheet: SheetGood = makeMaterial<SheetGood>({
        type: "plywood",
        length: (reqAny.length?.[0] || 8) as BoardDimension,
        width: (reqAny.width?.[0] || 4) as BoardDimension,
        thickness: (reqAny.thickness?.[0] || 2) as 1 | 2 | 3 | 4,
        kind: (reqAny.kind?.[0] || "plywoodA") as SheetGood["kind"],
      });
      return sheet;
    }

    case "shelf":
    case "rusticShelf":
    case "jewelryBox":
    case "simpleCuttingBoard": {
      const reqAny = req as any;
      const product: FinishedProduct = makeMaterial<FinishedProduct>({
        type: materialType as FinishedProduct["type"],
        species: (reqAny.species?.[0] || "pine") as Species,
      });
      return product;
    }

    default:
      // Fallback to a basic board
      return makeMaterial<Board>({
        type: "board",
        length: 8 as BoardDimension,
        width: 4 as BoardDimension,
        thickness: 2 as BoardDimension,
        species: "pine" as Species,
      });
  }
}

/**
 * Generates a preview of what an operation will produce given its parameters.
 * Calls the actual operation function with mock materials.
 */
export function generateOperationPreview(
  operation: ParameterizedOperation,
  params: ParameterValues,
): {
  expectedInputs: ReadonlyArray<InputMaterialWithQuantity>;
  mockMaterials: ReadonlyArray<MaterialInstance>;
  expectedOutputs: ReadonlyArray<MaterialInstance>;
} {
  // Get input requirements for these parameters
  const expectedInputs = operation.getInputMaterials(params);

  // Generate mock materials that satisfy requirements
  const mockMaterials = generateMockMaterials(expectedInputs);

  // Call the actual operation function to see what it produces
  const result = operation.output(mockMaterials, params);

  return {
    expectedInputs,
    mockMaterials,
    expectedOutputs: result.outputs,
  };
}
