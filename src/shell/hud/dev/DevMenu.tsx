import React, { useState } from "react";
import { Modal } from "../../../components/Modal";
import { useShortcut } from "../../../components/shortcuts/ShortcutProvider";
import { MACHINE_TYPES, MachineId } from "../../../game/Machine";
import { Species, SPECIES } from "../../../game/Materials";
import {
  devClearDust,
  devDeliverMachine,
  devDismissTutorials,
  devGrantMoney,
  devGrantReputation,
  devGrantSupplies,
  devSkipHour,
  devSleepNow,
  devSpawnBoard,
  devSpawnPallet,
  devUnlockAllSkills,
  devUnlockChannels,
} from "../../../sim/commands/dev-commands";
import { loadGameState } from "../../../sim/save/fixture";
import {
  loadSaveFile,
  SaveFile,
  serializeGame,
} from "../../../sim/save/SaveFile";
import { grantXp } from "../../../sim/systems/grants";
import { formatMoney } from "../../../utils/formatNumber";
import { useGame, useShopState } from "../../useShell";
import { TEST_FIXTURES } from "../../../../tests/fixtures";

/**
 * The dev menu: cheats for playtesting, on the backtick key. Dev builds
 * only — EngineHud never mounts it in production, and it bails on its own
 * too. Deliberately not in the paperwork design system: the raw dark
 * panel and the system monospace face are the signal that this is the
 * workbench under the game, not part of it.
 */
export const DevMenu: React.FC = () => {
  if (process.env.NODE_ENV === "production") return null;
  return <DevMenuBinding />;
};

const DevMenuBinding: React.FC = () => {
  const [open, setOpen] = useState(false);
  useShortcut("dev-menu", () => setOpen(true));
  if (!open) return null;
  return (
    // HudRoot's sheet is pointer-events: none; `contents` re-enables
    // them for the modal by inheritance without adding a box.
    <div className="pointer-events-auto contents">
      <DevMenuPanel onClose={() => setOpen(false)} />
    </div>
  );
};

/** One-line reminders of what each E2E fixture stages. */
const FIXTURE_LABELS: Record<string, string> = {
  "miter-saw-crate-shop": "miter saw crated at the entrance",
  "layout-with-placed-machines": "machines already placed on the floor",
  "cutting-board-shop": "the cutting-board chain",
  "pattern-board-shop": "sander + striped blank + sunrise glue-up strips",
  "end-grain-shop": "end-grain chain: sled runners, sanded maple panel",
  "consumables-shop": "starter bench, part-stripped pallet, bare shelf",
  "hand-tools-shop": "bare bench, cash for hand tools, pallet boards",
  "bench-work-shop": "at the bench, sanding block, board pinned",
  "milling-shop": "jointer + planer + sled, rough walnut, 48 rep",
  "resaw-shop": "band saw + table saw, 8/4 walnut, resawing",
  "miter-frame-shop": "miter saw + workspace, frame stock, mitered rails",
};

const SNAPSHOT_SLOTS = [1, 2, 3] as const;
const snapshotKey = (slot: number) => `woodworking-tycoon-dev-snapshot-${slot}`;

interface Snapshot {
  day: number;
  money: number;
  savedAt: string;
  file: SaveFile;
}

function readSnapshot(slot: number): Snapshot | null {
  try {
    const raw = localStorage.getItem(snapshotKey(slot));
    return raw ? (JSON.parse(raw) as Snapshot) : null;
  } catch {
    return null;
  }
}

const button =
  "rounded-sm border border-neutral-600 bg-neutral-800 px-2 py-0.5 text-left hover:bg-neutral-700 active:bg-neutral-600";

const DevMenuPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const game = useGame();
  const shopState = useShopState();
  useShortcut("close-dev-menu", onClose);

  const [machineId, setMachineId] = useState<MachineId>("jobsiteTableSaw");
  const [species, setSpecies] = useState<Species>("walnut");
  // Snapshots live in localStorage; this counter just re-reads them
  // after a save lands in a slot.
  const [, setSnapshotVersion] = useState(0);

  const saveSnapshot = (slot: number) => {
    const snapshot: Snapshot = {
      day: shopState.day,
      money: shopState.money,
      savedAt: new Date().toISOString(),
      file: serializeGame(game),
    };
    try {
      localStorage.setItem(snapshotKey(slot), JSON.stringify(snapshot));
    } catch (error) {
      console.error("Failed to save dev snapshot:", error);
    }
    setSnapshotVersion((version) => version + 1);
  };

  const loadSnapshot = (slot: number) => {
    const snapshot = readSnapshot(slot);
    if (!snapshot) return;
    loadSaveFile(game, snapshot.file);
    onClose();
  };

  const loadFixture = (name: string) => {
    loadGameState(game, TEST_FIXTURES[name]);
    onClose();
  };

  return (
    <Modal
      onClose={onClose}
      label="Dev menu"
      panelClassName="max-h-[85vh] w-[44rem] overflow-y-auto rounded-md border border-neutral-600 bg-neutral-900 p-4 font-mono text-xs text-neutral-200 shadow-2xl"
    >
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-bold text-neutral-50">dev menu</h2>
        <span className="text-neutral-400">
          day {shopState.day} · {formatMoney(shopState.money)} · rep{" "}
          {shopState.reputation} · ` or Esc closes
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Section title="scenarios (E2E fixtures)" className="col-span-2">
          <div className="grid grid-cols-2 gap-1">
            {Object.keys(TEST_FIXTURES).map((name) => (
              <button
                key={name}
                className={button}
                onClick={() => loadFixture(name)}
              >
                <span className="text-neutral-50">{name}</span>
                <span className="block text-neutral-400">
                  {FIXTURE_LABELS[name] ?? ""}
                </span>
              </button>
            ))}
          </div>
        </Section>

        <Section title="snapshots (this browser)" className="col-span-2">
          <div className="flex flex-col gap-1">
            {SNAPSHOT_SLOTS.map((slot) => {
              const snapshot = readSnapshot(slot);
              return (
                <div key={slot} className="flex items-center gap-2">
                  <span className="w-32 text-neutral-400">
                    slot {slot}:{" "}
                    {snapshot
                      ? `day ${snapshot.day}, ${formatMoney(snapshot.money)}`
                      : "empty"}
                  </span>
                  <button
                    className={button}
                    onClick={() => saveSnapshot(slot)}
                  >
                    save here
                  </button>
                  {snapshot && (
                    <button
                      className={button}
                      onClick={() => loadSnapshot(slot)}
                    >
                      load
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </Section>

        <Section title="grants">
          <div className="flex flex-wrap gap-1">
            <button className={button} onClick={() => devGrantMoney(game, 100)}>
              +$100
            </button>
            <button
              className={button}
              onClick={() => devGrantMoney(game, 1000)}
            >
              +$1,000
            </button>
            <button
              className={button}
              onClick={() => devGrantReputation(game, 5)}
            >
              +5 rep
            </button>
            <button className={button} onClick={() => grantXp(game, 250)}>
              +250 xp
            </button>
            <button
              className={button}
              onClick={() =>
                devGrantSupplies(
                  game,
                  [
                    { id: "nails", amount: 100 },
                    { id: "screws", amount: 100 },
                    { id: "mineralOil", amount: 32 },
                  ],
                  4,
                )
              }
            >
              top up supplies
            </button>
          </div>
        </Section>

        <Section title="time">
          <div className="flex flex-wrap gap-1">
            <button className={button} onClick={() => devSkipHour(game)}>
              skip 1 hour
            </button>
            <button
              className={button}
              onClick={() => {
                if (devSleepNow(game)) onClose();
              }}
            >
              go to bed
            </button>
          </div>
        </Section>

        <Section title="spawn">
          <div className="flex flex-wrap items-center gap-1">
            <select
              className="rounded-sm border border-neutral-600 bg-neutral-800 px-1 py-0.5"
              value={species}
              onChange={(e) => setSpecies(e.target.value as Species)}
            >
              {SPECIES.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
            <button
              className={button}
              onClick={() => devSpawnBoard(game, species, "rough")}
            >
              rough 8&apos; board
            </button>
            <button
              className={button}
              onClick={() => devSpawnBoard(game, species, "milled")}
            >
              milled 4&apos; board
            </button>
            <button className={button} onClick={() => devSpawnPallet(game)}>
              pallet
            </button>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <select
              className="rounded-sm border border-neutral-600 bg-neutral-800 px-1 py-0.5"
              value={machineId}
              onChange={(e) => setMachineId(e.target.value as MachineId)}
            >
              {Object.keys(MACHINE_TYPES).map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
            <button
              className={button}
              onClick={() => devDeliverMachine(game, machineId)}
            >
              deliver crated
            </button>
          </div>
        </Section>

        <Section title="world">
          <div className="flex flex-wrap gap-1">
            <button className={button} onClick={() => devClearDust(game)}>
              clear dust
            </button>
            <button className={button} onClick={() => devUnlockChannels(game)}>
              unlock store + lumberyard + manual
            </button>
            <button
              className={button}
              onClick={() => devUnlockAllSkills(game)}
            >
              unlock all skills
            </button>
            <button
              className={button}
              onClick={() => devDismissTutorials(game)}
            >
              dismiss tutorials
            </button>
          </div>
        </Section>
      </div>
    </Modal>
  );
};

const Section: React.FC<{
  title: string;
  className?: string;
  children: React.ReactNode;
}> = ({ title, className = "", children }) => (
  <section className={className}>
    <h3 className="mb-1 border-b border-neutral-700 pb-0.5 uppercase tracking-wider text-neutral-400">
      {title}
    </h3>
    {children}
  </section>
);
