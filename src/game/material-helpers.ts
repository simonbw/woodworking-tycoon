import { humanizeString } from "../utils/humanizeString";
import { idMaker } from "../utils/idMaker";
import { InputMaterial, InputMaterialWithQuantity } from "./Machine";
import {
  Board,
  BOARD_DIMENSIONS,
  BoardDimension,
  EndGrainSlice,
  endsLabel,
  FinishedProduct,
  MaterialInstance,
  millingLabel,
  Pallet,
  Panel,
  panelSpecies,
  panelWidth,
  SawdustPile,
  SheetGood,
  Species,
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
  "planterBox",
  "jewelryBox",
  "pictureFrame",
  "simpleCuttingBoard",
  "stripedCuttingBoard",
  "sunriseCuttingBoard",
  "endGrainCuttingBoard",
];

/**
 * The distinct species a material sheds when machined — what color its
 * sawdust is. Strip-built materials (panels, end-grain slices) report
 * every species they contain; sheet goods report none (their dust will
 * get pseudo-species of its own when they matter).
 */
export function materialSpecies(
  material: MaterialInstance,
): ReadonlyArray<Species> {
  if ("strips" in material) {
    return [...new Set(material.strips.map((strip) => strip.species))];
  }
  if ("species" in material) {
    const species: Species[] = [material.species];
    if (
      "accentSpecies" in material &&
      material.accentSpecies !== undefined &&
      material.accentSpecies !== material.species
    ) {
      species.push(material.accentSpecies);
    }
    return species;
  }
  return [];
}

export function isFinishedProduct(
  material: MaterialInstance,
): material is FinishedProduct {
  return FINISHED_PRODUCT_TYPES.includes(material.type);
}

export function getMaterialName(material: MaterialInstance): string {
  switch (material.type) {
    case "board": {
      const { species, width, length, thickness, surface } = material;
      const milling = millingLabel(material);
      // "rough sawn" already says the surface is rough — don't stutter
      const stateTag =
        milling === "rough sawn" && surface === "rough"
          ? milling
          : milling
            ? `${surface}, ${milling}`
            : surface;
      // Mitered ends read like a cut list entry: "45° both ends"
      const ends = endsLabel(material);
      const tags = ends ? `${stateTag}, ${ends}` : stateTag;
      return `${humanizeString(
        species,
      )} Board (${length}'x${width}"x${thickness}/4, ${tags})`;
    }
    case "panel": {
      const species = panelSpecies(material);
      const speciesName =
        species.length === 1 ? humanizeString(species[0]) : "Mixed Wood";
      const grainTag = material.grain === "end" ? "End-Grain " : "";
      return `${speciesName} ${grainTag}Panel (${material.length}'x${panelWidth(
        material,
      )}"x${material.thickness}/4, ${material.surface})`;
    }
    case "endGrainSlice": {
      const species = [...new Set(material.strips.map((s) => s.species))];
      const speciesName =
        species.length === 1 ? humanizeString(species[0]) : "Mixed Wood";
      return `${speciesName} End-Grain Slice`;
    }
    case "sawdustPile": {
      // Named for its dominant wood when one clearly leads the mix
      const entries = Object.entries(material.contents) as Array<
        [Species, number]
      >;
      const total = entries.reduce((sum, [, amount]) => sum + amount, 0);
      const dominant = entries.sort(([, a], [, b]) => b - a)[0];
      return dominant && total > 0 && dominant[1] / total >= 0.8
        ? `${humanizeString(dominant[0])} Sawdust`
        : "Mixed Sawdust";
    }
    default:
      if (isFinishedProduct(material)) {
        // "mineralOil" reads as "Oiled"; future finishes name themselves here
        const finishPrefix = material.finish === "mineralOil" ? "Oiled " : "";
        if (material.accentSpecies) {
          return `${finishPrefix}${humanizeString(
            material.species,
          )} & ${humanizeString(material.accentSpecies)} ${humanizeString(
            material.type,
          )}`;
        }
        return `${finishPrefix}${humanizeString(material.type)}`;
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
    case "planterBox":
      return 20;

    case "simpleCuttingBoard":
    case "stripedCuttingBoard":
    case "sunriseCuttingBoard":
    case "endGrainCuttingBoard":
    case "endGrainSlice":
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
        jointedFaces: r.jointedFaces?.[0] ?? 2,
        jointedEdges: r.jointedEdges?.[0] ?? 2,
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

    case "endGrainSlice":
      // Placeholder display only; a representative single-species slice
      return makeMaterial<EndGrainSlice>({
        type: "endGrainSlice",
        thickness: 4,
        strips: Array.from({ length: 5 }, () => ({
          species: "maple",
          width: 2,
        })),
      });

    case "jewelryBox":
    case "rusticShelf":
    case "shelf":
    case "planterBox":
    case "pictureFrame":
    case "simpleCuttingBoard":
    case "stripedCuttingBoard":
    case "sunriseCuttingBoard":
    case "endGrainCuttingBoard":
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

    case "sawdustPile":
      return makeMaterial<SawdustPile>({
        type: "sawdustPile",
        contents: {},
      });

    default:
      return assertUnreachable(requirement.type[0]);
  }
}

function assertUnreachable(x: never): never {
  throw new Error(`Unexpected object: ${x}`);
}

/** Join a list of choices with commas and a trailing "or" ("a", "a or b", "a, b, or c"). */
function joinOr(parts: ReadonlyArray<string>): string {
  if (parts.length <= 1) {
    return parts[0] ?? "";
  }
  if (parts.length === 2) {
    return `${parts[0]} or ${parts[1]}`;
  }
  return `${parts.slice(0, -1).join(", ")}, or ${parts[parts.length - 1]}`;
}

// Suffix that turns a raw dimension value into a readable measurement.
// Length is feet, width inches, thickness quarter-inches — matching getMaterialName.
const DIMENSION_UNITS = {
  length: "'",
  width: '"',
  thickness: "/4",
} as const;
type DimensionKey = keyof typeof DIMENSION_UNITS;
const DIMENSION_KEYS: ReadonlyArray<DimensionKey> = [
  "length",
  "width",
  "thickness",
];

/**
 * Attributes worth spelling out — including an explicit "any" when the
 * requirement leaves them unconstrained — for each stock type where
 * dimensions and surface actually matter, in reading order. Requirement
 * types absent from this map (finished products, pallets, …) only list the
 * constraints they actually carry.
 */
const DESCRIBABLE_ATTRIBUTES: Partial<
  Record<MaterialInstance["type"], ReadonlyArray<string>>
> = {
  board: [
    "species",
    "surface",
    "jointedFaces",
    "jointedEdges",
    "length",
    "width",
    "thickness",
  ],
  plywood: ["kind", "length", "width", "thickness"],
  panel: ["surface", "grain", "length", "thickness"],
};

// Constraint keys we know how to phrase, in the order they read best. Keeping
// this list in sync with what materialMeetsInput checks is what keeps the
// description honest — every key here is a key the matcher enforces.
const DESCRIBABLE_KEYS: ReadonlyArray<string> = [
  "species",
  "kind",
  "surface",
  "grain",
  "jointedFaces",
  "jointedEdges",
  "length",
  "width",
  "thickness",
];

/** The milling axes only speak up when a requirement actually constrains them. */
const JOINTED_KEYS = ["jointedFaces", "jointedEdges"] as const;
type JointedKey = (typeof JOINTED_KEYS)[number];

/**
 * Phrase a milling constraint (see JointedCount in Materials.ts) as shop
 * language instead of counts. Today's operations use thresholds ("at least
 * a reference face": [1, 2]), completions ([2]), or untouched stock ([0]).
 */
function describeJointedConstraint(
  key: JointedKey,
  values: ReadonlyArray<unknown>,
): string {
  const set = new Set(values as number[]);
  const faces = key === "jointedFaces";
  if (set.has(1) && set.has(2)) {
    return faces ? "a flat face" : "a straight edge";
  }
  if (set.has(2)) {
    return faces ? "faces planed parallel" : "edges ripped parallel";
  }
  if (set.has(1)) {
    return faces ? "one flat face" : "one straight edge";
  }
  return faces ? "faces not yet jointed" : "edges not yet jointed";
}

function requirementValues(
  req: InputMaterialWithQuantity,
  key: string,
): ReadonlyArray<unknown> | undefined {
  return (req as unknown as Record<string, ReadonlyArray<unknown> | undefined>)[
    key
  ];
}

/**
 * Plain-English summary of what a material requirement accepts, walking the
 * same keys materialMeetsInput enforces so display and matching stay in sync.
 * Renders dimensions ("2'×4"×1/4"), species, surface, etc.; unconstrained
 * attributes of dimensioned stock read as "any species" / "any surface".
 * Quantity is not included — callers render have/need counts separately.
 */
export function describeMaterialRequirement(
  req: InputMaterialWithQuantity,
): string {
  const types = req.type?.length
    ? joinOr(req.type.map((t) => humanizeString(t)))
    : "Material";

  const typeKey = req.type?.length === 1 ? req.type[0] : undefined;
  const applicable =
    (typeKey && DESCRIBABLE_ATTRIBUTES[typeKey]) ??
    // Types without a full attribute list only describe present constraints.
    DESCRIBABLE_KEYS.filter((key) => requirementValues(req, key) !== undefined);

  const qualifiers: string[] = [];
  const presentDims: DimensionKey[] = [];

  for (const key of applicable) {
    if (DIMENSION_KEYS.includes(key as DimensionKey)) {
      if (requirementValues(req, key) !== undefined) {
        presentDims.push(key as DimensionKey);
      }
      continue;
    }
    const values = requirementValues(req, key);
    if (JOINTED_KEYS.includes(key as JointedKey)) {
      // Unconstrained milling state stays silent — "any jointed faces" is
      // noise on the many requirements that don't care about milling.
      if (values !== undefined) {
        qualifiers.push(describeJointedConstraint(key as JointedKey, values));
      }
    } else if (values === undefined) {
      qualifiers.push(`any ${humanizeString(key).toLowerCase()}`);
    } else if (key === "grain") {
      qualifiers.push(
        `${joinOr(values.map((v) => humanizeString(String(v)).toLowerCase()))} grain`,
      );
    } else {
      qualifiers.push(joinOr(values.map((v) => humanizeString(String(v)))));
    }
  }

  // Dimensions: compact "L'×W"×T/4" when all three are present and each is a
  // single value; otherwise describe each present dimension on its own.
  const allDimsSingle =
    presentDims.length === DIMENSION_KEYS.length &&
    presentDims.every((key) => requirementValues(req, key)!.length === 1);

  const dimClauses: string[] = [];
  if (allDimsSingle) {
    dimClauses.push(
      DIMENSION_KEYS.map(
        (key) => `${requirementValues(req, key)![0]}${DIMENSION_UNITS[key]}`,
      ).join("×"),
    );
  } else {
    for (const key of DIMENSION_KEYS) {
      const values = requirementValues(req, key);
      const label = humanizeString(key).toLowerCase();
      if (values === undefined) {
        if (applicable.includes(key)) {
          dimClauses.push(`any ${label}`);
        }
      } else {
        dimClauses.push(
          `${label} ${joinOr(values.map((v) => `${v}${DIMENSION_UNITS[key]}`))}`,
        );
      }
    }
  }

  const details = [...qualifiers, ...dimClauses];
  return details.length ? `${types} (${details.join(", ")})` : types;
}
