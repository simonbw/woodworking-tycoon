import {
  defaultParametersFor,
  InputMaterialWithQuantity,
  Operation,
  ParameterValues,
} from "./Machine";
import { MaterialInstance } from "./Materials";
import {
  createMockMaterial,
  describeMaterialRequirement,
  getMaterialFullName,
} from "./material-helpers";

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
      results.push(createMockMaterial(req));
    }
  }

  return results;
}

/**
 * Generates a preview of what an operation will produce given its parameters.
 * Calls the actual operation function with mock materials.
 */
export function generateOperationPreview(
  operation: Operation,
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
export function describeOperationIO(operation: Operation): {
  inputs: string[];
  outputs: string[];
} {
  const params = defaultParametersFor(operation);
  const requirements = operation.getInputMaterials(params);

  const inputs = requirements.map((req) =>
    req.quantity > 1
      ? `${req.quantity}× ${describeMaterialRequirement(req)}`
      : describeMaterialRequirement(req),
  );

  let outputs: string[] = [];
  try {
    const result = operation.output(
      generateMockMaterials(requirements),
      params,
    );
    const names = result.outputs.map((material) =>
      getMaterialFullName(material),
    );
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
