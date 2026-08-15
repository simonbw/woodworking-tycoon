import { Machine, MACHINE_TYPES } from "../../game/Machine";
import { BandSawArt } from "./BandSawArt";
import { GarbageCanArt } from "./GarbageCanArt";
import { JobsiteTableSawArt } from "./JobsiteTableSawArt";
import { JointerArt } from "./JointerArt";
import { LumberShelfArt } from "./LumberShelfArt";
import { LunchboxPlanerArt } from "./LunchboxPlanerArt";
import { MachineArtBase } from "./machine-art";
import { MiterSawArt } from "./MiterSawArt";
import { SawhorsesArt } from "./SawhorsesArt";
import { SimpleStationArt } from "./simple-station";
import { StorageRackArt } from "./StorageRackArt";
import { WorktableArt } from "./WorktableArt";

/**
 * Per-machine-type art dispatch — the old `LocalMachineSprite`'s switch.
 * Every art draws in machine-local pixels about the origin cell's
 * center; the caller owns position and rotation.
 */
export function createMachineArt(machine: Machine): MachineArtBase {
  if (machine.type.worktable) {
    return new WorktableArt(machine);
  }
  switch (machine.type.id) {
    case MACHINE_TYPES.garbageCan.id:
      return new GarbageCanArt();
    case MACHINE_TYPES.storageRack.id:
      return new StorageRackArt();
    case MACHINE_TYPES.lumberShelf.id:
      return new LumberShelfArt();
    case MACHINE_TYPES.jobsiteTableSaw.id:
      return new JobsiteTableSawArt(machine);
    case MACHINE_TYPES.miterSaw.id:
      return new MiterSawArt(machine);
    case MACHINE_TYPES.lunchboxPlaner.id:
      return new LunchboxPlanerArt(machine);
    case MACHINE_TYPES.jointer.id:
      return new JointerArt(machine);
    case MACHINE_TYPES.bandSaw.id:
      return new BandSawArt(machine);
    // The horses draw bare; the sheet across them is staged stock
    case MACHINE_TYPES.sawhorses.id:
      return new SawhorsesArt(machine);
    // The makeshift workbench, and the brown-square fallback for any
    // machine without art of its own
    default:
      return new SimpleStationArt(machine);
  }
}
