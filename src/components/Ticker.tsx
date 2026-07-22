import React, { ReactNode, useEffect, useRef } from "react";
import { tickAction } from "../game/game-actions/tickAction";
import { ShortcutId } from "../game/shortcuts";
import { TICKS_PER_DAY } from "../game/time";
import { classNames } from "../utils/classNames";
import { useShortcut } from "./shortcuts/ShortcutProvider";
import {
  TICK_SPEED_FAST,
  TICK_SPEED_FASTER,
  TICK_SPEED_NORMAL,
  TICK_SPEED_PAUSED,
  useTickSpeed,
} from "./TickSpeedContext";
import { Tooltip } from "./Tooltip";
import { useUiMode } from "./UiMode";
import { useApplyGameAction, useGameState } from "./useGameState";

const PAUSED = TICK_SPEED_PAUSED;
const NORMAL = TICK_SPEED_NORMAL;
const FAST = TICK_SPEED_FAST;
const FASTER = TICK_SPEED_FASTER;

const SpeedButton: React.FC<{
  speed: number;
  title: string;
  shortcut: ShortcutId;
  children: ReactNode;
  ticksPerSecond: number;
  setTicksPerSecond: (speed: number) => void;
}> = ({
  speed,
  children,
  title,
  shortcut,
  ticksPerSecond,
  setTicksPerSecond,
}) => {
  return (
    <Tooltip content={title} shortcut={shortcut}>
      <button
        className={classNames(
          "px-1.5 py-0.5 text-xs text-center font-condensed",
          "hover:bg-paper-manila/10",
          ticksPerSecond === speed
            ? "bg-paper-manila/20 text-paper-manila"
            : "text-paper-manila/60",
        )}
        onClick={(e) => {
          setTicksPerSecond(speed);
          e.currentTarget.blur();
        }}
        tabIndex={-1}
      >
        {children}
      </button>
    </Tooltip>
  );
};

/**
 * Drives the game loop and shows the day + speed controls as a compact
 * strip docked in the top bar on every screen. Time advances on the shop
 * floor and the marketplace (listings must be able to sell and the job
 * board to refresh while you browse) — the store and layout editor still
 * pause the world.
 */
export const Ticker: React.FC = () => {
  const gameState = useGameState();
  const applyAction = useApplyGameAction();
  const { mode } = useUiMode();
  const timeRuns = mode.mode === "normal" || mode.mode === "marketplace";
  const controlsUnlocked = gameState.progression.tickSpeedControlsUnlocked;
  const { ticksPerSecond, setTicksPerSecond } = useTickSpeed();

  useEffect(() => {
    if (!timeRuns) return;
    const interval = setInterval(() => {
      if (ticksPerSecond > 0) {
        applyAction(tickAction);
      }
    }, 1000 / ticksPerSecond);
    return () => clearInterval(interval);
  }, [ticksPerSecond, timeRuns]);

  useShortcut("speed-pause", () => setTicksPerSecond(PAUSED), controlsUnlocked);
  useShortcut(
    "speed-normal",
    () => setTicksPerSecond(NORMAL),
    controlsUnlocked,
  );
  useShortcut("speed-fast", () => setTicksPerSecond(FAST), controlsUnlocked);
  useShortcut(
    "speed-faster",
    () => setTicksPerSecond(FASTER),
    controlsUnlocked,
  );
  useShortcut("speed-step", () => applyAction(tickAction), controlsUnlocked);
  // Resume at whatever speed was running before the pause, rather than
  // silently dropping the player back to NORMAL from FAST/FASTER.
  const speedBeforePause = useRef<number>(NORMAL);
  useShortcut(
    "speed-toggle",
    () =>
      setTicksPerSecond((current) => {
        if (current !== PAUSED) {
          speedBeforePause.current = current;
          return PAUSED;
        }
        return speedBeforePause.current;
      }),
    controlsUnlocked,
  );

  const day = Math.floor(gameState.tick / TICKS_PER_DAY) + 1;
  const dayPercent = ((gameState.tick % TICKS_PER_DAY) / TICKS_PER_DAY) * 100;

  return (
    <section className="flex items-center gap-3">
      <div className="w-24">
        <div className="flex items-baseline justify-between leading-none">
          <span className="font-condensed uppercase tracking-[0.2em] text-[0.65rem] text-paper-manila/60">
            Day
          </span>
          <span className="font-condensed font-bold text-base text-paper-manila tabular-nums">
            {day}
          </span>
        </div>
        <div className="relative h-1 bg-paper-manila/20 rounded-full overflow-hidden mt-1">
          <span
            style={{ width: dayPercent + "%" }}
            className="absolute inset-y-0 left-0 bg-gold/80 transition-[width] ease-linear"
          />
        </div>
      </div>
      {controlsUnlocked && (
        <menu className="flex rounded border border-paper-manila/25 overflow-hidden">
          <SpeedButton
            speed={PAUSED}
            title="Pause game"
            shortcut="speed-pause"
            ticksPerSecond={ticksPerSecond}
            setTicksPerSecond={setTicksPerSecond}
          >
            ⏸
          </SpeedButton>
          <Tooltip content="Step forward one tick" shortcut="speed-step">
            <button
              className="px-1.5 py-0.5 text-xs text-center font-condensed text-paper-manila/60 hover:bg-paper-manila/10"
              onClick={(e) => {
                applyAction(tickAction);
                e.currentTarget.blur();
              }}
              tabIndex={-1}
            >
              ❯
            </button>
          </Tooltip>
          <SpeedButton
            title="Play at normal speed"
            shortcut="speed-normal"
            speed={NORMAL}
            ticksPerSecond={ticksPerSecond}
            setTicksPerSecond={setTicksPerSecond}
          >
            ▶
          </SpeedButton>
          <SpeedButton
            title="Play at fast speed"
            shortcut="speed-fast"
            speed={FAST}
            ticksPerSecond={ticksPerSecond}
            setTicksPerSecond={setTicksPerSecond}
          >
            ▶▶
          </SpeedButton>
          <SpeedButton
            title="Play at faster speed"
            shortcut="speed-faster"
            speed={FASTER}
            ticksPerSecond={ticksPerSecond}
            setTicksPerSecond={setTicksPerSecond}
          >
            ▶▶▶
          </SpeedButton>
        </menu>
      )}
    </section>
  );
};
