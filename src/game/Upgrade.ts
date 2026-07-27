/**
 * Worktable upgrades: parts installed into a table's upgrade slots
 * (`MachineType.upgradeSlots`, worktables only — the makeshift workbench
 * stays humble). Upgrades are the tools' sibling system: bought or
 * shop-built into `GameState.storage.upgrades`, installed from the
 * station card, and their effects fold into the Machine view's computed
 * stats (workSpeed / toolSlots / materialStorage). Installing the same
 * upgrade twice stacks — a front vise and a tail vise is a real bench.
 */
export interface UpgradeType {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Store price. Irrelevant for shop-built upgrades (craftedOnly). */
  readonly cost: number;
  /** Never sold — built at a bench (see benchOperations.ts). */
  readonly craftedOnly?: boolean;
  /** Multiplies the station's attended work speed (see getOperationPhases). */
  readonly workSpeedFactor?: number;
  /** Extra tool slots on top of the table's own. */
  readonly extraToolSlots?: number;
  /** Extra shelf spaces on top of the table's own. */
  readonly extraMaterialStorage?: number;
}

const vise: UpgradeType = {
  id: "vise",
  name: "Bench Vise",
  description:
    "Cast-iron jaws bolted to the bench edge. Attended hand work at " +
    "this table runs 25% faster.",
  cost: 80,
  workSpeedFactor: 1.25,
};

const toolDrawers: UpgradeType = {
  id: "toolDrawers",
  name: "Tool Drawers",
  description:
    "A drawer bank under the top. Adds two tool slots to this table.",
  cost: 0,
  craftedOnly: true,
  extraToolSlots: 2,
};

const materialShelf: UpgradeType = {
  id: "materialShelf",
  name: "Material Shelf",
  description:
    "A second shelf below the first. Adds four stock spaces to this table.",
  cost: 0,
  craftedOnly: true,
  extraMaterialStorage: 4,
};

export const UPGRADE_TYPES = {
  vise,
  toolDrawers,
  materialShelf,
} satisfies { [id: string]: UpgradeType };

export type UpgradeId = keyof typeof UPGRADE_TYPES;
