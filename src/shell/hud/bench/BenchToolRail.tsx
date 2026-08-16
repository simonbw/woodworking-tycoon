import React from "react";
import {
  HintSurfaceContext,
  Kbd,
  ShortcutKeys,
} from "../../../components/shortcuts/Kbd";
import { useShortcut } from "../../../components/shortcuts/ShortcutProvider";
import { benchGroupAt } from "../../../game/bench-work/bench-group";
import { clampsFree } from "../../../game/Clamp";
import { getMachines, machineKey } from "../../../game/Machine";
import { ToolItem } from "../../../game/Materials";
import { handSpaceLeft } from "../../../game/Person";
import { ShortcutId } from "../../../game/shortcuts";
import { availableOperations } from "../../../game/skill-helpers";
import { TOOL_TYPES, ToolId } from "../../../game/Tool";
import {
  gatherBenchTool,
  mountTool,
  unmountTool,
} from "../../../sim/commands/tool-commands";
import { projectGameState } from "../../../sim/projection";
import { toolIconSrc } from "../../../utils/uiImages";
import { BenchDive } from "../../scenes/bench/BenchDive";
import { useGame, useShellVersion } from "../../useShell";

const BENCH_TOOL_SHORTCUTS: readonly ShortcutId[] = [
  "bench-tool-1",
  "bench-tool-2",
  "bench-tool-3",
  "bench-tool-4",
  "bench-tool-5",
  "bench-tool-6",
  "bench-tool-7",
  "bench-tool-8",
  "bench-tool-9",
];

/**
 * The tool rail across the top of the bench view — not a list in a
 * sheet, the rail itself, and the whole of tool management. Mounted
 * tools hang on it: click one to take it in hand (the tool in hand is
 * the mode, docs/bench-work.md decision 0), click it again or press
 * Escape to hang it back up, or hit the small ✕ to take it off the rail
 * into the arms. Free slots show as empty hooks; a compatible tool
 * carried in the arms appears ghosted on a hook, and clicking it hangs
 * it up — mounting adds its operations to the bench's work.
 *
 * Tables pushed together are one bench (bench-work/bench-group.ts), so
 * the rail shows the whole run's tools: the neighbours' hang past a
 * divider, and clicking one slides it onto this table's rack and takes
 * it in hand — the same move-then-work the pieces make. A full rack
 * refuses the slide, saying so in the hook's title.
 *
 * The glue-up's two hands hang at the end: a bar clamp off the rack and
 * the bottle. They aren't tools — nothing mounts them — so they only
 * show where a glue-up could happen.
 */
export const BenchToolRail: React.FC = () => {
  const game = useGame();
  useShellVersion();
  const dive = game.entities.tryGetSingleton(BenchDive);
  const bench = dive?.openBench();

  const gameState = projectGameState(game);
  const machine = bench?.view();
  const tools = machine?.state.tools ?? [];
  const toolSlots = machine?.toolSlots ?? 0;
  const freeSlots = Math.max(0, toolSlots - tools.length);
  // Tools change what the station can do, so the rail holds still until
  // the running job is off it.
  const working = machine?.operationProgress.status === "inProgress";
  // A removed tool lands in the arms, so they need a slot free for it.
  const handsFull = handSpaceLeft(gameState.player) < 1;
  // What's carried is what can go on the rail.
  const mountable = machine
    ? gameState.player.inventory
        .filter((item): item is ToolItem => item.type === "tool")
        .filter((tool) => {
          const compatible = TOOL_TYPES[tool.toolId].compatibleMachines;
          return (
            !compatible || compatible.includes(machine.state.machineTypeId)
          );
        })
    : [];
  // The rest of the run's tools, hung past the divider.
  const neighbourTools = machine
    ? benchGroupAt(getMachines(gameState.machines), machine)
        .members.map((member) => member.machine)
        .filter(
          (member) =>
            machineKey(member.state) !== machineKey(machine.state) &&
            member.state.operationProgress.status !== "inProgress",
        )
        .flatMap((member) =>
          member.state.tools
            .filter((toolId) => {
              const compatible = TOOL_TYPES[toolId].compatibleMachines;
              return (
                !compatible || compatible.includes(machine.state.machineTypeId)
              );
            })
            .map((toolId) => ({ toolId, fromKey: machineKey(member.state) })),
        )
    : [];
  const railFull = freeSlots <= 0;

  // The digits answer to the hooks in rail order: digit N does what
  // clicking the Nth hook does, whether that's a mounted tool or a
  // carried one ghosted on a free hook. Registered unconditionally
  // (hooks), enabled per hook exactly when its click would work.
  for (const [index, shortcutId] of BENCH_TOOL_SHORTCUTS.entries()) {
    const mounted: ToolId | undefined = tools[index];
    const ghost = index < toolSlots ? mountable[index - tools.length] : null;
    // eslint-disable-next-line react-hooks/rules-of-hooks -- fixed-length list
    useShortcut(
      shortcutId,
      () => {
        if (mounted) dive?.toggleTool(mounted);
        else if (ghost && bench) mountTool(game, bench, ghost);
      },
      bench != null && (mounted != null || (ghost != null && !working)),
    );
  }

  if (!dive || !bench || !machine) return null;

  const glue = availableOperations(machine, gameState.progression).some(
    (operation) => operation.interaction?.kind === "glue",
  );
  const clampsAvailable = clampsFree(gameState.clamps, gameState.machines);
  if (toolSlots === 0 && !glue) return null;

  return (
    // The rail is dark workshop chrome, so every key cap on it — the
    // hooks' numbers, the put-back hint — takes the chrome face.
    <HintSurfaceContext.Provider value="chrome">
      <div
        // below-top-bar keeps the rail's ends clear of the top bar's
        // chip cluster at narrow windows — hooks must stay clickable
        className="pointer-events-auto absolute left-1/2 below-top-bar z-50 flex -translate-x-1/2 items-center gap-2 rounded border-2 border-black/40 bg-[#4a3826]/95 px-3 py-1.5 shadow-lg"
        data-testid="bench-tool-rail"
      >
        <span className="mr-1 flex flex-col items-start font-condensed uppercase tracking-[0.15em] text-[0.6rem] text-paper-manila/60">
          <span>Tools</span>
          <span className="tabular-nums text-paper-manila/40">
            {tools.length}/{toolSlots} slots
          </span>
        </span>

        {tools.map((toolId, index) => {
          const held = dive.heldTool === toolId;
          return (
            <span key={`${toolId}-${index}`} className="group relative">
              <button
                type="button"
                data-testid={`bench-tool-${toolId}`}
                aria-label={
                  held
                    ? `Hang up the ${TOOL_TYPES[toolId].name}`
                    : `Pick up the ${TOOL_TYPES[toolId].name}`
                }
                title={TOOL_TYPES[toolId].name}
                data-sfx="ui-tab"
                onClick={(event) => {
                  event.stopPropagation();
                  dive.toggleTool(toolId);
                }}
                className={`cursor-pointer rounded p-1 transition-transform hover:-translate-y-0.5 hover:drop-shadow-[0_3px_4px_rgba(0,0,0,0.5)] ${
                  held ? "opacity-30" : ""
                }`}
              >
                <img
                  src={toolIconSrc(toolId)}
                  alt=""
                  draggable={false}
                  className="size-11 select-none [image-rendering:pixelated] drop-shadow-[0_2px_2px_rgba(0,0,0,0.45)]"
                />
              </button>
              {index < BENCH_TOOL_SHORTCUTS.length && (
                <Kbd className="pointer-events-none absolute -bottom-1 -left-1">
                  {index + 1}
                </Kbd>
              )}
              {/* Off the rail and into the arms — shown on hover so the
                  rail reads as tools first, management second */}
              {!held && (
                <button
                  type="button"
                  aria-label={`Remove the ${TOOL_TYPES[toolId].name}`}
                  title={
                    handsFull
                      ? "Hands full"
                      : `Take the ${TOOL_TYPES[toolId].name} off the rail`
                  }
                  disabled={working || handsFull}
                  onClick={(event) => {
                    event.stopPropagation();
                    unmountTool(game, bench, toolId);
                  }}
                  className="absolute -right-0.5 -top-0.5 hidden size-4 items-center justify-center rounded-full border border-black/50 bg-paper-manila text-[0.6rem] leading-none text-ink-black shadow group-hover:flex disabled:opacity-40"
                >
                  ✕
                </button>
              )}
            </span>
          );
        })}

        {Array.from({ length: freeSlots }, (_, index) => {
          const candidate = mountable[index];
          const hookNumber = tools.length + index + 1;
          return candidate ? (
            <span key={`hook-${index}`} className="relative">
              <button
                type="button"
                aria-label={`Attach the ${TOOL_TYPES[candidate.toolId].name}`}
                title={`Hang the ${TOOL_TYPES[candidate.toolId].name} here (in hand)`}
                disabled={working}
                onClick={(event) => {
                  event.stopPropagation();
                  mountTool(game, bench, candidate);
                }}
                className="rounded border border-dashed border-paper-manila/40 p-1 opacity-70 transition-transform hover:-translate-y-0.5 hover:opacity-100 disabled:opacity-40"
              >
                <img
                  src={toolIconSrc(candidate.toolId)}
                  alt=""
                  draggable={false}
                  className="size-11 select-none opacity-50 [image-rendering:pixelated]"
                />
              </button>
              {hookNumber <= BENCH_TOOL_SHORTCUTS.length && (
                <Kbd className="pointer-events-none absolute -bottom-1 -left-1">
                  {hookNumber}
                </Kbd>
              )}
            </span>
          ) : (
            // A bare hook: the slot is real, there's just nothing carried
            // that hangs on it
            <span
              key={`hook-${index}`}
              title="An empty hook — carry a tool here to hang it"
              className="flex size-[52px] items-center justify-center rounded border border-dashed border-paper-manila/25"
            >
              <span className="size-1.5 rounded-full bg-paper-manila/30" />
            </span>
          );
        })}

        {/* The neighbours' tools, past a divider: one rail for the whole
            run. Clicking slides the tool onto this table's rack and
            takes it in hand */}
        {neighbourTools.length > 0 && (
          <span className="ml-1 flex items-center gap-2 border-l border-paper-manila/20 pl-3">
            {neighbourTools.map(({ toolId, fromKey }, index) => (
              <button
                key={`${fromKey}-${toolId}-${index}`}
                type="button"
                data-testid={`bench-run-tool-${toolId}`}
                aria-label={`Bring the ${TOOL_TYPES[toolId].name} to this bench`}
                title={
                  railFull
                    ? "The rail is full — take a tool off first"
                    : "On the next table over — click to bring it here"
                }
                disabled={working || railFull}
                onClick={(event) => {
                  event.stopPropagation();
                  if (gatherBenchTool(game, bench, toolId)) {
                    if (dive.heldTool !== toolId) dive.toggleTool(toolId);
                  }
                }}
                className={`rounded p-1 opacity-60 transition-transform ${
                  working || railFull
                    ? "cursor-default opacity-40"
                    : "cursor-pointer hover:-translate-y-0.5 hover:opacity-100 hover:drop-shadow-[0_3px_4px_rgba(0,0,0,0.5)]"
                }`}
              >
                <img
                  src={toolIconSrc(toolId)}
                  alt=""
                  draggable={false}
                  className="size-11 select-none [image-rendering:pixelated] drop-shadow-[0_2px_2px_rgba(0,0,0,0.45)]"
                />
              </button>
            ))}
          </span>
        )}

        {glue && (
          <span className="ml-1 flex items-center gap-2 border-l border-paper-manila/20 pl-3">
            <RailButton
              testId="bench-clamp"
              label="Clamp"
              title={`Bar clamps — ${clampsAvailable} free on the rack`}
              held={dive.holdingClamp}
              disabled={clampsAvailable === 0 && !dive.holdingClamp}
              onClick={() =>
                dive.setHolding(dive.holdingClamp ? null : "clamp")
              }
            />
            <RailButton
              testId="bench-glue-bottle"
              label="Glue"
              title="Wood glue — run a bead down each open seam"
              held={dive.holdingGlue}
              onClick={() => dive.setHolding(dive.holdingGlue ? null : "glue")}
            />
          </span>
        )}

        {/* With something in hand the rail says how to let go of it —
            the hook it came off is right there, but the key is quicker
            and it isn't guessable */}
        {dive.handsFull() && (
          <span
            data-testid="bench-put-back-hint"
            className="ml-1 flex items-center gap-1.5 border-l border-paper-manila/20 pl-3 font-condensed text-[0.65rem] text-paper-manila/70"
          >
            <ShortcutKeys shortcut="put-back-tool" />
            put it back
          </span>
        )}
      </div>
    </HintSurfaceContext.Provider>
  );
};

/** One plain chip on the rail — the clamp and the bottle, which have no
 * tool icon of their own. */
const RailButton: React.FC<{
  testId: string;
  label: string;
  title: string;
  held: boolean;
  disabled?: boolean;
  onClick: () => void;
}> = ({ testId, label, title, held, disabled, onClick }) => (
  <button
    type="button"
    data-testid={testId}
    aria-pressed={held}
    title={title}
    disabled={disabled}
    onClick={onClick}
    data-sfx="ui-tab"
    className={`rounded-sm border px-2.5 py-1.5 font-condensed uppercase tracking-wider text-xs disabled:opacity-40 ${
      held
        ? "border-gold bg-gold/20 text-paper-ivory"
        : "border-workshop-edge bg-workshop-bg/85 text-paper-manila hover:bg-workshop-bg"
    }`}
  >
    {label}
  </button>
);
