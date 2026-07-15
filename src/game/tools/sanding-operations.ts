import { MachineOperation } from "../Machine";
import {
  Board,
  improvedSurface,
  MaterialInstance,
  Panel,
} from "../Materials";
import { isBoard } from "../board-helpers";
import { isPanel } from "../panel-helpers";
import { makeMaterial } from "../material-helpers";

/**
 * Sanding bumps a material one step up the surface ladder (rough → smooth →
 * sanded) and never changes dimensions. Every sanding tool shares these
 * operations — only the duration differs, because better tools buy time,
 * not capability.
 */
export function makeSandingOperations(
  idPrefix: string,
  duration: number,
): ReadonlyArray<MachineOperation> {
  const sand = (materials: ReadonlyArray<MaterialInstance>) => {
    const material = materials[0];
    if (!isBoard(material) && !isPanel(material)) {
      throw new Error("Can only sand boards and panels");
    }
    const surface = improvedSurface(material.surface);
    if (surface === null) {
      throw new Error("Material is already fully sanded");
    }
    return {
      inputs: [],
      outputs: [
        isBoard(material)
          ? makeMaterial<Board>({ ...material, surface })
          : makeMaterial<Panel>({ ...material, surface }),
      ],
    };
  };

  return [
    {
      id: `${idPrefix}SandBoard`,
      name: "Sand Board",
      duration,
      inputMaterials: [
        { type: ["board"], surface: ["rough", "smooth"], quantity: 1 },
      ],
      output: sand,
    },
    {
      id: `${idPrefix}SandPanel`,
      name: "Sand Panel",
      duration,
      inputMaterials: [
        { type: ["panel"], surface: ["rough", "smooth"], quantity: 1 },
      ],
      output: sand,
    },
  ];
}
