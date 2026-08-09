import { MaterialInstance } from "../Materials";
import { makeMaterial } from "../material-helpers";
import { isPanel } from "../panel-helpers";
import { cutSheet, isSheetGood } from "../sheet-helpers";
import { ToolType } from "../Tool";
import { EndGrainSlice } from "../Materials";

/** How many slices one panel yields — abstracted, not inch-accurate. */
export const SLICES_PER_PANEL = 4;

/**
 * How wide a piece the sled will carry past the blade, in inches — its
 * own base, near enough. A sheet wider than this has to be ripped down
 * before it can be cut to length, which is the order you'd do it in
 * anyway.
 */
export const SLED_CROSSCUT_CAPACITY_IN = 24;

/** The sled's length stops: every inch, out to what it can carry. */
const SHEET_CROSSCUT_LENGTHS = Array.from(
  { length: 45 },
  (_, index) => index + 4,
);

/**
 * The first piece of shop-made tooling: never sold, built at the workspace
 * (see workspace's Build Crosscut Sled). Mounted on the table saw it makes
 * wide panel crosscuts safe — the doorway to end-grain boards.
 */
export const crosscutSled: ToolType = {
  id: "crosscutSled",
  name: "Crosscut Sled",
  description:
    "A plywood base on hardwood runners. Carries stock past the blade for square crosscuts on the table saw.",
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
      getInputMaterials: () => [
        {
          type: ["panel"],
          length: [24],
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
    {
      id: "crosscutSheet",
      name: "Crosscut Sheet",
      requiredSkill: "jigsAndFixtures",
      duration: 18,
      dustOutput: 2.2,
      parameters: [
        {
          id: "sheetCrosscutLength",
          name: "Stop",
          values: SHEET_CROSSCUT_LENGTHS,
          defaultValue: 24,
        },
      ],
      getInputMaterials: (params) => {
        const stop = params.sheetCrosscutLength as number;
        return [
          {
            type: ["plywood"],
            quantity: 1,
            matches: (material) =>
              isSheetGood(material) &&
              material.length > stop &&
              material.width <= SLED_CROSSCUT_CAPACITY_IN,
            matchesNote: `longer than the ${stop}" stop and no wider than ${SLED_CROSSCUT_CAPACITY_IN}"`,
          },
        ];
      },
      explainRejection: (material, params) => {
        if (!isSheetGood(material)) {
          return null;
        }
        if (material.width > SLED_CROSSCUT_CAPACITY_IN) {
          return `The sled only carries ${SLED_CROSSCUT_CAPACITY_IN}" past the blade, and this sheet is wider. Rip it down first.`;
        }
        const stop = params?.sheetCrosscutLength as number;
        if (material.length <= stop) {
          return `The stop is set at ${stop}" and the sheet is no longer than that. Bring the stop in.`;
        }
        return null;
      },
      output: (materials, params) => {
        const sheet = materials[0];
        if (!isSheetGood(sheet)) {
          throw new Error("Input material is not a sheet good");
        }
        return cutSheet(sheet, params.sheetCrosscutLength as number, "length");
      },
    },
  ],
};
