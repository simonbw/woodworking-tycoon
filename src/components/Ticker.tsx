import React, { ReactNode, useEffect, useRef, useState } from "react";
import { tickAction } from "../game/game-actions/tickAction";
import { ShortcutId } from "../game/shortcuts";
import { TICKS_PER_DAY } from "../game/time";
import { classNames } from "../utils/classNames";
import { useShortcut } from "./shortcuts/ShortcutProvider";
import { Tooltip } from "./Tooltip";
import { useApplyGameAction, useGameState } from "./useGameState";

const PAUSED = 0;
const NORMAL = 5;
const FAST = 10;
const FASTER = 20;

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
          "p-1 text-center text-sm grow font-condensed",
          "hover:bg-ink-black/10",
          ticksPerSecond === speed
            ? "bg-ink-black/15 text-ink-black"
            : "bg-transparent text-ink-black/70",
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

export const Ticker: React.FC = () => {
  const gameState = useGameState();
  const applyAction = useApplyGameAction();
  const controlsUnlocked = gameState.progression.tickSpeedControlsUnlocked;
  const [ticksPerSecond, setTicksPerSecond] = useState<number>(NORMAL);

  useEffect(() => {
    const interval = setInterval(() => {
      if (ticksPerSecond > 0) {
        applyAction(tickAction);
      }
    }, 1000 / ticksPerSecond);
    return () => clearInterval(interval);
  }, [ticksPerSecond]);

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

  return (
    <section className="max-w-fit">
      <CalendarPage tick={gameState.tick} />
      {controlsUnlocked && (
        <div className="bg-paper-cream border-x border-b border-paper-manila-edge rounded-b-sm overflow-hidden">
          <menu className="flex gap-0 justify-stretch">
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
                className="p-1 text-center text-sm grow font-condensed text-ink-black/70 hover:bg-ink-black/10"
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
        </div>
      )}
    </section>
  );
};

const CalendarPage: React.FC<{ tick: number }> = ({ tick }) => {
  const day = Math.floor(tick / TICKS_PER_DAY);
  const time = tick % TICKS_PER_DAY;
  const dayPercent = (time / TICKS_PER_DAY) * 100;

  return (
    <div className="relative bg-paper-ivory text-ink-black rounded-t-sm shadow-md border border-paper-manila-edge overflow-hidden w-48">
      {/* Tear-off perforation at the top */}
      <div className="h-1.5 bg-ink-red/85" />

      <div className="px-3 pt-2 pb-1 flex flex-col items-center font-typewriter">
        <span className="text-[0.625rem] uppercase tracking-[0.3em] text-ink-fade leading-none">
          Day
        </span>
        <span className="font-stencil text-3xl leading-none mt-0.5">
          {day + 1}
        </span>
      </div>

      {/* Day-progress rule along the bottom */}
      <div className="relative h-1 bg-paper-manila-edge/40 mx-3 mb-2">
        <span
          style={{ width: dayPercent + "%" }}
          className="absolute top-0 bottom-0 left-0 bg-ink-blue/80 transition-[width] ease-linear"
        />
      </div>
    </div>
  );
};
