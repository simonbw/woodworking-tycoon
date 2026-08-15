import { z } from "zod";
import { Persistence } from "../../config/constants";
import { BaseEntity } from "../../core/entity/BaseEntity";
import { Entity } from "../../core/entity/Entity";
import { UPGRADE_TYPES, UpgradeId } from "../../game/Upgrade";
import {
  registerSerializable,
  SerializableEntity,
} from "../save/serialization";

/**
 * Worktable upgrades owned but not installed (see `src/game/Upgrade.ts`,
 * shared with the old world). Installed upgrades live on their station.
 */

const upgradeIdSchema: z.ZodType<UpgradeId, z.ZodTypeDef, string> = z
  .string()
  .refine((id): id is UpgradeId => id in UPGRADE_TYPES, {
    message: "unknown upgrade id",
  });

const schema = z.object({
  upgrades: z.array(upgradeIdSchema),
});

type StorageUpgradesData = z.infer<typeof schema>;

export class StorageUpgrades
  extends BaseEntity
  implements Entity, SerializableEntity
{
  readonly saveType = "storageUpgrades";
  id = "storageUpgrades";
  persistenceLevel: number = Persistence.Game;

  upgrades: UpgradeId[];

  constructor(data: Partial<StorageUpgradesData> = {}) {
    super();
    this.upgrades = [...(data.upgrades ?? [])];
  }

  toJSON(): StorageUpgradesData {
    return { upgrades: [...this.upgrades] };
  }
}

registerSerializable({
  type: "storageUpgrades",
  singleton: true,
  schema,
  fromJSON: (data) => new StorageUpgrades(data),
});
