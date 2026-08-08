import { ToolType } from "../Tool";
import { cutSheet, isSheetGood } from "../sheet-helpers";

/**
 * How the straightedge is set: clamped to a mark, and marks get made to
 * the half foot. The saw is for breaking a sheet into pieces you can
 * carry to the table saw, not for cutting anything to final size — the
 * fence does that, to the inch. Same detents the hand saw marks to.
 */
const STRAIGHTEDGE_DETENTS = Array.from(
  { length: 15 },
  (_, index) => (index + 1) * 6,
);

/**
 * A circular saw and a clamped straightedge — the only way to cut a
 * sheet nothing else in the shop will take (see docs/sheet-goods.md).
 *
 * It buys exactly one thing: a full sheet costs the least per square
 * foot of any wood in the store, and this is what makes a full sheet
 * usable. What it costs is setup. The straightedge is clamped down for
 * every cut, out of the same pool a glue-up draws from, and it comes off
 * with the offcut — there is no setting that stays set. And the cut
 * lands on a half-foot mark, so the piece still goes to the saw
 * afterward to reach its actual size.
 */
export const circularSaw: ToolType = {
  id: "circularSaw",
  name: "Circular Saw",
  description:
    "A hand-held saw and a straightedge to clamp down. Breaks full sheets into pieces the table saw can take.",
  cost: 65,
  compatibleMachines: ["sawhorses"],
  operations: [
    {
      id: "breakDownSheet",
      name: "Break Down Sheet",
      requiredSkill: "basicMilling",
      // Marking, clamping, walking the cut, unclamping. Slower than the
      // same cut on the saw, and that's before the setup.
      duration: 30,
      dustOutput: 2.4,
      // The straightedge, pinned to the sheet at both ends.
      clampsHeld: 2,
      parameters: [
        {
          id: "cutAcross",
          name: "Cut",
          // R turns the cut, the way you'd turn the sheet on the horses.
          values: ["down the sheet", "across the sheet"],
          defaultValue: "across the sheet",
          presentation: "rotate",
        },
        {
          id: "straightedge",
          name: "Straightedge",
          values: STRAIGHTEDGE_DETENTS,
          defaultValue: 24,
        },
      ],
      getInputMaterials: (params) => {
        const mark = params.straightedge as number;
        const across = params.cutAcross === "across the sheet";
        return [
          {
            type: ["plywood"],
            quantity: 1,
            matches: (material) =>
              isSheetGood(material) &&
              (across ? material.length : material.width) > mark,
            matchesNote: across
              ? `longer than the ${mark}" mark`
              : `wider than the ${mark}" mark`,
          },
        ];
      },
      explainRejection: (material, params) => {
        if (!isSheetGood(material)) {
          return null;
        }
        const mark = params?.straightedge as number;
        const across = params?.cutAcross === "across the sheet";
        const reach = across ? material.length : material.width;
        if (reach <= mark) {
          return `The straightedge is marked at ${mark}" and the sheet only runs ${reach}" that way. Move the mark in, or turn the cut with R.`;
        }
        return null;
      },
      output: (materials, params) => {
        const sheet = materials[0];
        if (!isSheetGood(sheet)) {
          throw new Error("Input material is not a sheet good");
        }
        return cutSheet(
          sheet,
          params.straightedge as number,
          params.cutAcross === "across the sheet" ? "length" : "width",
        );
      },
    },
  ],
};
