import { Machine, MachineId } from "./Machine";
import { MaterialInstance, panelWidth } from "./Materials";

/**
 * How much wood a machine's cut is taking off, as a scalar with 1 at a
 * reference cut of mid-heavy stock. Two consumers: the synth voices scale
 * their strain by it (rpm bog, cut boosts — see `machineSynth.ts`), and the
 * tick scales `dustOutput` by it, so a wide slab both sounds harder-worked
 * and sheds proportionally more sawdust than a skinny strip.
 *
 * Which dimension loads the machine is physical: a planer (or a jointer
 * flattening a FACE) spans the stock's width with its knives, a jointer
 * straightening an EDGE only meets the thickness, a table saw rips through
 * the thickness, and a miter saw chops the whole cross-section (geometric
 * mean, so both dimensions matter equally).
 */
export function deriveMachineCutLoad(machine: Machine): number {
  // Mid-operation the stock lives in processing; before the first tick it
  // may still be waiting on the infeed.
  const stock =
    machine.processingMaterials.length > 0
      ? machine.processingMaterials
      : machine.inputMaterials;
  const ratios = stock
    .map((material) =>
      loadRatio(
        machine.state.machineTypeId,
        machine.state.selectedOperationId,
        material,
      ),
    )
    .filter((ratio): ratio is number => ratio !== null);
  if (ratios.length === 0) {
    return 1;
  }
  return Math.min(1.3, Math.max(0.4, Math.max(...ratios)));
}

/** Stock dimensions at which the load ratio is exactly 1. */
const REFERENCE_WIDTH_IN = 5;
const REFERENCE_THICKNESS_IN = 1.25;

function loadRatio(
  machineTypeId: MachineId,
  operationId: string | undefined,
  material: MaterialInstance,
): number | null {
  const section = cutSection(material);
  if (!section) {
    return null;
  }
  const widthRatio = section.widthIn / REFERENCE_WIDTH_IN;
  const thicknessRatio = section.thicknessIn / REFERENCE_THICKNESS_IN;
  switch (machineTypeId) {
    case "lunchboxPlaner":
      return widthRatio;
    case "jointer":
      // Edge jointing stands the board on edge: the knives only meet the
      // thickness. Face jointing spans the width like the planer.
      return operationId === "jointEdge" ? thicknessRatio : widthRatio;
    case "jobsiteTableSaw":
      return thicknessRatio;
    case "miterSaw":
      return Math.sqrt(widthRatio * thicknessRatio);
    default:
      return null;
  }
}

/** The cross-section the cutter meets, in inches (thickness is stored in quarters). */
function cutSection(
  material: MaterialInstance,
): { widthIn: number; thicknessIn: number } | null {
  switch (material.type) {
    case "board":
      return { widthIn: material.width, thicknessIn: material.thickness / 4 };
    case "panel":
      return {
        widthIn: panelWidth(material),
        thicknessIn: material.thickness / 4,
      };
    case "plywood":
      return { widthIn: material.width, thicknessIn: material.thickness / 4 };
    default:
      return null;
  }
}
