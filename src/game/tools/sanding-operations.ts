import { Operation, OperationInteraction } from "../Machine";
import { Board, improvedSurface, MaterialInstance, Panel } from "../Materials";
import { isBoard } from "../board-helpers";
import { isPanel } from "../panel-helpers";
import { makeMaterial } from "../material-helpers";

/**
 * Sanding bumps a material one step up the surface ladder (rough → smooth →
 * sanded) and never changes dimensions. Every sanding tool shares these
 * operations — only the brush differs, because better tools buy time,
 * not capability: sanding is stroke work in the bench view (see
 * docs/bench-minigames.md), and a better sander is a wider, faster brush,
 * not a multiplier on a bar. `duration` survives as the legacy tick
 * budget (the ShopDriver's hands-free ceiling and old balance numbers).
 */
export function makeSandingOperations(
  idPrefix: string,
  duration: number,
  brush: { brushWidthIn: number; coveragePerSecond: number; powered?: boolean },
): ReadonlyArray<Operation> {
  const interaction: OperationInteraction = { kind: "stroke", ...brush };
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
      interaction,
      dustOutput: 0.5,
      requiredSkill: "surfacePrep",
      getInputMaterials: () => [
        { type: ["board"], surface: ["rough", "smooth"], quantity: 1 },
      ],
      output: sand,
    },
    {
      id: `${idPrefix}SandPanel`,
      name: "Sand Panel",
      duration,
      interaction,
      dustOutput: 0.5,
      requiredSkill: "surfacePrep",
      getInputMaterials: () => [
        { type: ["panel"], surface: ["rough", "smooth"], quantity: 1 },
      ],
      output: sand,
    },
  ];
}
