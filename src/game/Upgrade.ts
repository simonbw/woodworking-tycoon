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

const upgradeDefs = {
  vise: {
    id: "vise",
    name: "Bench Vise",
    description:
      "Cast-iron jaws bolted to the bench. Held work is fast work: " +
      "attended hand work at this table runs a quarter faster.",
    cost: 80,
    workSpeedFactor: 1.25,
  },
  toolDrawers: {
    id: "toolDrawers",
    name: "Tool Drawers",
    description:
      "A drawer bank under the top. Two more tool slots at this table.",
    cost: 0,
    craftedOnly: true,
    extraToolSlots: 2,
  },
  materialShelf: {
    id: "materialShelf",
    name: "Material Shelf",
    description:
      "A second shelf below the first. Four more shelf spaces for stock.",
    cost: 0,
    craftedOnly: true,
    extraMaterialStorage: 4,
  },
} satisfies { [id: string]: UpgradeType };

export type UpgradeId = keyof typeof upgradeDefs;

/** Typed as the interface so optional effect fields read cleanly. */
export const UPGRADE_TYPES: Record<UpgradeId, UpgradeType> = upgradeDefs;
