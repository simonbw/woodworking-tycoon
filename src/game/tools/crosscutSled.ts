import { MaterialInstance } from "../Materials";
import { makeMaterial } from "../material-helpers";
import { isPanel } from "../panel-helpers";
import { ToolType } from "../Tool";
import { EndGrainSlice } from "../Materials";

/** How many slices one panel yields — abstracted, not inch-accurate. */
export const SLICES_PER_PANEL = 4;

/**
 * The first piece of shop-made tooling: never sold, built at the workspace
 * (see workspace's Build Crosscut Sled). Mounted on the table saw it makes
 * wide panel crosscuts safe — the doorway to end-grain boards.
 */
export const crosscutSled: ToolType = {
  id: "crosscutSled",
  name: "Crosscut Sled",
  description:
    "Plywood base, hardwood runners. You can't buy one this good — you build it.",
  cost: 0,
  craftedOnly: true,
  compatibleMachines: ["jobsiteTableSaw"],
  operations: [
    {
      name: "Crosscut Panel",
      id: "crosscutPanel",
      requiredSkill: "jigsAndFixtures",
      duration: 20,
      dustOutput: 1,
      inputMaterials: [
        {
          type: ["panel"],
          length: [2],
          thickness: [3, 4],
          // A clean face makes clean slices; and end grain never goes
          // back through the blade as a panel
          surface: ["smooth", "sanded"],
          quantity: 1,
          matches: (material) => isPanel(material) && material.grain !== "end",
        },
      ],
      output: (materials: ReadonlyArray<MaterialInstance>) => {
        const inputPanel = materials[0];
        if (!isPanel(inputPanel)) {
          throw new Error("Input material is not a panel");
        }
        // Every slice inherits the panel's strip pattern — that's what
        // future checkerboards are made of
        return {
          inputs: [],
          outputs: Array.from({ length: SLICES_PER_PANEL }, () =>
            makeMaterial<EndGrainSlice>({
              type: "endGrainSlice",
              strips: inputPanel.strips,
              thickness: inputPanel.thickness,
            }),
          ),
        };
      },
    },
  ],
};
