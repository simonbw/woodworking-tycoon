import { humanizeString } from "../utils/humanizeString";
import { idMaker } from "../utils/idMaker";
import { InputMaterial, InputMaterialWithQuantity } from "./Machine";
import {
  Board,
  BOARD_DIMENSIONS,
  BoardDimension,
  FinishedProduct,
  MaterialInstance,
  Pallet,
  Panel,
  panelSpecies,
  panelWidth,
  SheetGood,
  UnknownMaterial,
} from "./Materials";

const makeId = idMaker();

export function makeMaterial<T extends MaterialInstance>(
  materialInitializer: Omit<T, "id">,
): T {
  return {
    ...materialInitializer,
    id: `m-${makeId()}`,
  } as T;
}

export function makePallet() {
  return makeMaterial<Pallet>({
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
}

const FINISHED_PRODUCT_TYPES: ReadonlyArray<MaterialInstance["type"]> = [
  "shelf",
  "rusticShelf",
  "jewelryBox",
  "simpleCuttingBoard",
  "stripedCuttingBoard",
  "sunriseCuttingBoard",
];

export function isFinishedProduct(
  material: MaterialInstance,
): material is FinishedProduct {
  return FINISHED_PRODUCT_TYPES.includes(material.type);
}

export function getMaterialName(material: MaterialInstance): string {
  switch (material.type) {
    case "board": {
      const { species, width, length, thickness, surface } = material;
      return `${humanizeString(
        species,
      )} Board (${length}'x${width}"x${thickness}/4, ${surface})`;
    }
    case "panel": {
      const species = panelSpecies(material);
      const speciesName =
        species.length === 1 ? humanizeString(species[0]) : "Mixed Wood";
      return `${speciesName} Panel (${material.length}'x${panelWidth(
        material,
      )}"x${material.thickness}/4, ${material.surface})`;
    }
    default:
      if (isFinishedProduct(material) && material.accentSpecies) {
        return `${humanizeString(material.species)} & ${humanizeString(
          material.accentSpecies,
        )} ${humanizeString(material.type)}`;
      }
      return humanizeString(material.type);
  }
}

// Returns the amount of space an item takes up in the inventory
export function getMaterialInventorySize(material: MaterialInstance): number {
  switch (material.type) {
    case "pallet":
      return 100;

    case "board": {
      const { length, width, thickness } = material;
      const size = length * width * thickness;
      const maxDimension = Math.max(...BOARD_DIMENSIONS);
      const maxSize = maxDimension * maxDimension * maxDimension;
      return (size / maxSize) * 100;
    }

    case "panel": {
      const size = material.length * panelWidth(material) * material.thickness;
      const maxDimension = Math.max(...BOARD_DIMENSIONS);
      const maxSize = maxDimension * maxDimension * maxDimension;
      return (size / maxSize) * 100;
    }

    case "jewelryBox":
      return 10;

    case "shelf":
      return 20;

    case "simpleCuttingBoard":
    case "stripedCuttingBoard":
    case "sunriseCuttingBoard":
      return 10;

    case "plywood": {
      const { length, width, thickness } = material;
      const size = length * width * thickness;
      const maxDimension = Math.max(...BOARD_DIMENSIONS);
      const maxSize = maxDimension * maxDimension * maxDimension;
      return (size / maxSize) * 100;
    }

    default:
      return 10;
  }
}

export function materialToInput<T extends MaterialInstance = MaterialInstance>(
  material: T,
): InputMaterial<T> {
  const result: Record<string, unknown[]> = {};
  for (const key in material) {
    if (key !== "id") {
      result[key] = [material[key]];
    }
  }
  return result as InputMaterial<T>;
}

export function materialMeetsInput(
  material: MaterialInstance,
  inputMaterial: InputMaterial,
) {
  if (inputMaterial.matches && !inputMaterial.matches(material)) {
    return false;
  }
  for (const key of Object.keys(inputMaterial)) {
    // Skip quantity and matches: they're not properties of the material
    if (key === "quantity" || key === "matches") {
      continue;
    } else if (!(key in material)) {
      return false;
    } else if (
      !(inputMaterial as Record<string, unknown[]>)[key].includes(
        (material as Record<string, unknown>)[key],
      )
    ) {
      return false;
    }
  }
  return true;
}

// Helper to create a mock material from a requirement for placeholder display
export function createMockMaterial(
  requirement: InputMaterialWithQuantity,
): MaterialInstance {
  if (requirement.type === undefined || requirement.type.length === 0) {
    throw new Error("Requirement must specify at least one material type");
  }

  switch (requirement.type[0]) {
    case "board": {
      const r = requirement as InputMaterialWithQuantity<Board>;
      return makeMaterial<Board>({
        type: "board",
        length: r.length?.[0] || 8,
        width: r.width?.[0] || 4,
        thickness: r.thickness?.[0] || 2,
        species: r.species?.[0] || "pine",
        surface: r.surface?.[0] || "rough",
      });
    }
    case "plywood": {
      const r = requirement as InputMaterialWithQuantity<SheetGood>;
      return makeMaterial<SheetGood>({
        type: "plywood",
        kind: r.kind?.[0] || "plywoodA",
        length: (r.length?.[0] || 8) as BoardDimension,
        width: (r.width?.[0] || 4) as BoardDimension,
        thickness: (r.thickness?.[0] || 2) as SheetGood["thickness"],
      });
    }

    case "pallet":
      return makeMaterial<Pallet>({
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

    case "jewelryBox":
    case "rusticShelf":
    case "shelf":
    case "simpleCuttingBoard":
    case "stripedCuttingBoard":
    case "sunriseCuttingBoard":
      return makeMaterial<FinishedProduct>({
        type: requirement.type[0],
        species:
          "species" in requirement
            ? (requirement.species?.[0] ?? "pine")
            : "pine",
      });

    case "panel": {
      // Placeholder display only; a representative single-species blank
      const r = requirement as InputMaterialWithQuantity<Panel>;
      return makeMaterial<Panel>({
        type: "panel",
        length: 2,
        thickness: r.thickness?.[0] || 4,
        surface: r.surface?.[0] || "rough",
        strips: Array.from({ length: 5 }, () => ({
          species: "maple",
          width: 2,
        })),
      });
    }

    case "unknown":
      return makeMaterial<UnknownMaterial>({
        type: "unknown",
      });

    default:
      return assertUnreachable(requirement.type[0]);
  }
}

function assertUnreachable(x: never): never {
  throw new Error(`Unexpected object: ${x}`);
}
