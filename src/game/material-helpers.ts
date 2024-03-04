import { humanizeString } from "../utils/humanizeString";
import { idMaker } from "../utils/idMaker";
import { BOARD_DIMENSIONS, MaterialInstance, Pallet } from "./Materials";

const makeId = idMaker();

// TODO: This is all wrong somehow
export function makeMaterial<T extends MaterialInstance>(
  materialInitializer: Omit<T, "id">
): T {
  return {
    id: `m-${makeId()}`,
    ...materialInitializer,
  } as T; // TODO: Why is this cast necessary?
}

export function makePallet() {
  return makeMaterial<Pallet>({
    type: "pallet",
    deckBoardsLeft: [
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

export function getMaterialName(material: MaterialInstance): string {
  switch (material.type) {
    case "board": {
      const { species, width, length, thickness } = material;
      return `${humanizeString(
        species
      )} Board (${length}'x${width}"x${thickness}/4)`;
    }
    default:
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

    case "jewelryBox":
      return 10;

    case "shelf":
      return 20;

    case "simpleCuttingBoard":
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
