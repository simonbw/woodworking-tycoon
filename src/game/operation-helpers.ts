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
  Panel,
  SheetGood,
  FinishedProduct,
  BoardDimension,
  Species,
} from "./Materials";
import {
  describeMaterialRequirement,
  getMaterialName,
  makeMaterial,
} from "./material-helpers";
import { TOOL_TYPES } from "./Tool";

/**
 * Type guard to check if an operation is parameterized
 */
export function isParameterizedOperation(
  operation: MachineOperation | ParameterizedOperation,
): operation is ParameterizedOperation {
  return "parameters" in operation && "getInputMaterials" in operation;
}

/**
 * The parameter values a freshly-selected operation starts with: the first
 * listed value of each parameter. Undefined for plain operations.
 */
export function defaultParametersFor(
  operation: MachineOperation | ParameterizedOperation,
): ParameterValues | undefined {
  if (!isParameterizedOperation(operation)) {
    return undefined;
  }
  const params: ParameterValues = {};
  for (const param of operation.parameters) {
    params[param.id] = param.values[0];
  }
  return params;
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
        surface: (reqAny.surface?.[0] || "rough") as Board["surface"],
        jointedFaces: (reqAny.jointedFaces?.[0] ?? 2) as Board["jointedFaces"],
        jointedEdges: (reqAny.jointedEdges?.[0] ?? 2) as Board["jointedEdges"],
      });
      return board;
    }

    case "panel": {
      const reqAny = req as any;
      // Width is derived from the strip list; five 2" strips make a 10"
      // panel, wide enough for every current panel recipe.
      const species = (reqAny.species?.[0] || "pine") as Species;
      const mockPanel: Panel = makeMaterial<Panel>({
        type: "panel",
        strips: Array.from({ length: 5 }, () => ({
          species,
          width: 2 as BoardDimension,
        })),
        length: (reqAny.length?.[0] || 2) as BoardDimension,
        thickness: (reqAny.thickness?.[0] || 4) as BoardDimension,
        surface: (reqAny.surface?.[0] || "rough") as Panel["surface"],
        grain: reqAny.grain?.[0] as Panel["grain"],
      });
      return mockPanel;
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
    case "simpleCuttingBoard":
    case "stripedCuttingBoard":
    case "sunriseCuttingBoard": {
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
        surface: "rough",
        jointedFaces: 1,
        jointedEdges: 2,
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

/**
 * One-line ingredient/product summary for a recipe listing ("2× Board →
 * Panel"), computed from the operation's own requirement and output
 * functions so the listing can't drift from what the recipe actually does.
 * Parameterized operations are summarized at their default parameters.
 * Recipes whose preview can't run from mock materials just list inputs.
 */
export function describeOperationIO(
  operation: MachineOperation | ParameterizedOperation,
): { inputs: string[]; outputs: string[] } {
  const params = defaultParametersFor(operation);
  const requirements = getOperationInputMaterials(operation, params);

  const inputs = requirements.map((req) =>
    req.quantity > 1
      ? `${req.quantity}× ${describeMaterialRequirement(req)}`
      : describeMaterialRequirement(req),
  );

  let outputs: string[] = [];
  try {
    const result = executeOperation(
      operation,
      generateMockMaterials(requirements),
      params,
    );
    const names = [
      ...result.outputs.map((material) => getMaterialName(material)),
      ...(result.toolOutputs ?? []).map((toolId) => TOOL_TYPES[toolId].name),
    ];
    // Collapse repeats: ["Board", "Board"] → ["2× Board"]
    const counts = new Map<string, number>();
    for (const name of names) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    outputs = [...counts.entries()].map(([name, count]) =>
      count > 1 ? `${count}× ${name}` : name,
    );
  } catch (error) {
    outputs = [];
  }

  return { inputs, outputs };
}
