import { Operation, OperationInteraction } from "../Machine";
import {
  FinishedProduct,
  MaterialInstance,
  panelSpecies,
  panelWidth,
  Species,
} from "../Materials";
import { isFinishedProduct, makeMaterial } from "../material-helpers";
import {
  isPanel,
  isSunrisePattern,
  stripsAlternate,
  widthDominantSpecies,
} from "../panel-helpers";

/**
 * The finishing kit's work: the last pass that turns a sanded blank into
 * a board someone would buy — corners rounded, edges eased, the whole
 * face rubbed down — and the oil wiped on after. All of it is stroke work
 * in the bench view: the pad in hand over the piece where it lies IS the
 * operation, like every other tool (see docs/bench-work.md).
 *
 * Order matters: tool-first selection (bench-work/tool-work.ts) walks
 * this list and offers the first operation the piece satisfies, so the
 * pickiest patterns come first — a striped panel is also a two-tone
 * panel, and the stripes should win.
 */

/** Rubbing a blank out: a soft pad, covering ground at a steady hand. */
const FINISH_INTERACTION: OperationInteraction = {
  kind: "stroke",
  brushWidthIn: 3.5,
  coveragePerSecond: 40,
};

/** The oil wipe: a wide rag and a quick, generous pass. */
const OIL_INTERACTION: OperationInteraction = {
  kind: "stroke",
  brushWidthIn: 5,
  coveragePerSecond: 60,
};

/** The most common strip species in a panel (ties go to first appearance). */
function dominantSpecies(strips: ReadonlyArray<{ species: Species }>): Species {
  const counts = new Map<Species, number>();
  for (const strip of strips) {
    counts.set(strip.species, (counts.get(strip.species) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

export const FINISHING_OPERATIONS: ReadonlyArray<Operation> = [
  {
    name: "Finish Sunrise Board",
    id: "finishSunriseBoard",
    requiredSkill: "sunriseBoards",
    duration: 40,
    interaction: FINISH_INTERACTION,
    getInputMaterials: () => [
      {
        type: ["panel"],
        length: [24],
        thickness: [3, 4],
        surface: ["sanded"],
        quantity: 1,
        // The gradient fade: two real woods, one shrinking strip by
        // strip as the other grows (see isSunrisePattern). Minimum
        // pattern (3,1,2,2,1,3) is already 12" wide.
        matches: (material) =>
          isPanel(material) &&
          panelSpecies(material).length === 2 &&
          material.strips.every((strip) => strip.species !== "pallet") &&
          isSunrisePattern(material.strips),
      },
    ],
    output: (materials: ReadonlyArray<MaterialInstance>) => {
      const blank = materials[0];
      if (!isPanel(blank)) {
        throw new Error("Input material is not a panel");
      }
      // The wider wood reads as the board's color, the other as accent
      const species = widthDominantSpecies(blank.strips);
      const accentSpecies = panelSpecies(blank).find((s) => s !== species)!;
      return {
        inputs: [],
        outputs: [
          makeMaterial<FinishedProduct>({
            type: "sunriseCuttingBoard",
            species,
            accentSpecies,
          }),
        ],
      };
    },
  },
  {
    name: "Finish Checkerboard Board",
    id: "finishCheckerboardBoard",
    requiredSkill: "checkerboards",
    duration: 55,
    interaction: FINISH_INTERACTION,
    getInputMaterials: () => [
      {
        type: ["panel"],
        length: [12],
        thickness: [8],
        surface: ["sanded"],
        quantity: 1,
        // An end-grain blank glued from STRIPED slices: two real woods in
        // strict alternation. Flipping every other slice at the glue-up is
        // what turns the stripes into checkers.
        matches: (material) =>
          isPanel(material) &&
          material.grain === "end" &&
          panelWidth(material) >= 10 &&
          panelSpecies(material).length === 2 &&
          material.strips.every((strip) => strip.species !== "pallet") &&
          stripsAlternate(material.strips),
      },
    ],
    output: (materials: ReadonlyArray<MaterialInstance>) => {
      const blank = materials[0];
      if (!isPanel(blank)) {
        throw new Error("Input material is not a panel");
      }
      const species = dominantSpecies(blank.strips);
      const accentSpecies = panelSpecies(blank).find((s) => s !== species)!;
      return {
        inputs: [],
        outputs: [
          makeMaterial<FinishedProduct>({
            type: "checkerboardCuttingBoard",
            species,
            accentSpecies,
          }),
        ],
      };
    },
  },
  {
    name: "Finish Striped Board",
    id: "finishStripedBoard",
    requiredSkill: "stripedBoards",
    duration: 30,
    interaction: FINISH_INTERACTION,
    getInputMaterials: () => [
      {
        type: ["panel"],
        length: [24],
        thickness: [3, 4],
        surface: ["sanded"],
        quantity: 1,
        // A two-tone with discipline: 2" strips of two real woods in
        // strict alternation, at least 10" wide
        matches: (material) =>
          isPanel(material) &&
          panelWidth(material) >= 10 &&
          material.strips.every((strip) => strip.width === 2) &&
          panelSpecies(material).length === 2 &&
          material.strips.every((strip) => strip.species !== "pallet") &&
          stripsAlternate(material.strips),
      },
    ],
    output: (materials: ReadonlyArray<MaterialInstance>) => {
      const blank = materials[0];
      if (!isPanel(blank)) {
        throw new Error("Input material is not a panel");
      }
      const species = dominantSpecies(blank.strips);
      const accentSpecies = panelSpecies(blank).find((s) => s !== species)!;
      return {
        inputs: [],
        outputs: [
          makeMaterial<FinishedProduct>({
            type: "stripedCuttingBoard",
            species,
            accentSpecies,
          }),
        ],
      };
    },
  },
  {
    name: "Finish Two-Tone Board",
    id: "finishTwoToneBoard",
    requiredSkill: "twoToneBoards",
    duration: 25,
    interaction: FINISH_INTERACTION,
    getInputMaterials: () => [
      {
        type: ["panel"],
        length: [24],
        thickness: [3, 4],
        surface: ["sanded"],
        quantity: 1,
        // Like a cutting board, but striped from exactly two real woods
        matches: (material) =>
          isPanel(material) &&
          panelWidth(material) >= 10 &&
          material.strips.every((strip) => strip.width === 2) &&
          panelSpecies(material).length === 2 &&
          material.strips.every((strip) => strip.species !== "pallet"),
      },
    ],
    output: (materials: ReadonlyArray<MaterialInstance>) => {
      const blank = materials[0];
      if (!isPanel(blank)) {
        throw new Error("Input material is not a panel");
      }
      const species = dominantSpecies(blank.strips);
      const accentSpecies = panelSpecies(blank).find((s) => s !== species)!;
      return {
        inputs: [],
        outputs: [
          makeMaterial<FinishedProduct>({
            type: "simpleCuttingBoard",
            species,
            accentSpecies,
          }),
        ],
      };
    },
  },
  {
    name: "Finish Cutting Board",
    id: "finishCuttingBoard",
    requiredSkill: "panelWork",
    duration: 20,
    interaction: FINISH_INTERACTION,
    getInputMaterials: () => [
      {
        type: ["panel"],
        length: [24],
        thickness: [3, 4],
        // Food-safe means fully sanded — a planed surface isn't enough
        surface: ["sanded"],
        quantity: 1,
        // A proper cutting board: a panel at least 10" wide, glued from
        // 2" strips of a single real hardwood — no pallet chemicals near
        // food.
        matches: (material) =>
          isPanel(material) &&
          panelWidth(material) >= 10 &&
          material.strips.every((strip) => strip.width === 2) &&
          panelSpecies(material).length === 1 &&
          material.strips[0].species !== "pallet",
      },
    ],
    output: (materials: ReadonlyArray<MaterialInstance>) => {
      const blank = materials[0];
      if (!isPanel(blank)) {
        throw new Error("Input material is not a panel");
      }
      return {
        inputs: [],
        outputs: [
          makeMaterial<FinishedProduct>({
            type: "simpleCuttingBoard",
            species: blank.strips[0].species,
          }),
        ],
      };
    },
  },
  {
    name: "Finish End-Grain Board",
    id: "finishEndGrainBoard",
    requiredSkill: "endGrainBoards",
    duration: 45,
    interaction: FINISH_INTERACTION,
    getInputMaterials: () => [
      {
        type: ["panel"],
        length: [12],
        thickness: [8],
        surface: ["sanded"],
        quantity: 1,
        // v1 is the single-species butcher block; checkerboards come
        // with slice orientation later
        matches: (material) =>
          isPanel(material) &&
          material.grain === "end" &&
          panelWidth(material) >= 10 &&
          panelSpecies(material).length === 1 &&
          material.strips[0].species !== "pallet",
      },
    ],
    output: (materials: ReadonlyArray<MaterialInstance>) => {
      const blank = materials[0];
      if (!isPanel(blank)) {
        throw new Error("Input material is not a panel");
      }
      return {
        inputs: [],
        outputs: [
          makeMaterial<FinishedProduct>({
            type: "endGrainCuttingBoard",
            species: blank.strips[0].species,
          }),
        ],
      };
    },
  },
  {
    name: "Oil Cutting Board",
    id: "oilCuttingBoard",
    requiredSkill: "surfacePrep",
    duration: 6 + 24,
    // The wipe is your hands; then the oil soaks in on its own time
    phases: [
      { name: "Wipe On Oil", duration: 6, attended: true },
      { name: "Soaking In", duration: 24, attended: false },
    ],
    interaction: OIL_INTERACTION,
    requiredConsumables: [{ id: "mineralOil", amount: 4 }],
    getInputMaterials: () => [
      {
        type: [
          "simpleCuttingBoard",
          "stripedCuttingBoard",
          "sunriseCuttingBoard",
          "endGrainCuttingBoard",
          "checkerboardCuttingBoard",
        ],
        quantity: 1,
        // Boards only get oiled once
        matches: (material) =>
          isFinishedProduct(material) && material.finish === undefined,
      },
    ],
    output: (materials: ReadonlyArray<MaterialInstance>) => {
      const rawBoard = materials[0];
      if (!isFinishedProduct(rawBoard)) {
        throw new Error("Input material is not a cutting board");
      }
      return {
        inputs: [],
        outputs: [
          makeMaterial<FinishedProduct>({
            ...rawBoard,
            finish: "mineralOil",
          }),
        ],
      };
    },
  },
];
