import { MaterialInstance } from "./Materials";
import { humanizeString } from "../utils/humanizeString";

export function getMaterialName(material: MaterialInstance) {
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
