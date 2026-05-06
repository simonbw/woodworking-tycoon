import React, { ReactNode, useEffect, useState } from "react";
import { tickAction } from "../game/game-actions/tickAction";
import { classNames } from "../utils/classNames";
import { useApplyGameAction, useGameState } from "./useGameState";
import { useKeyDown } from "./useKeyDown";

const PAUSED = 0;
const NORMAL = 5;
const FAST = 10;
const FASTER = 20;

const SpeedButton: React.FC<{
  speed: number;
  title: string;
  children: ReactNode;
  ticksPerSecond: number;
  setTicksPerSecond: (speed: number) => void;
}> = ({ speed, children, title, ticksPerSecond, setTicksPerSecond }) => {
  return (
    <button
      className={classNames(
        "align-middle font-sans p-1 tracking-[-0.2em] text-center text-sm grow",
        "hover:bg-white/5",
        ticksPerSecond === speed ? "bg-white/10" : "bg-transparent",
      )}
      onClick={(e) => {
        setTicksPerSecond(speed);
        e.currentTarget.blur();
      }}
      title={title}
      tabIndex={-1}
    >
      {children}
    </button>
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

  useKeyDown((event) => {
    if (!controlsUnlocked) return;
    switch (event.key) {
      case "`":
        setTicksPerSecond(PAUSED);
        break;
      case "1":
        setTicksPerSecond(NORMAL);
        break;
      case "2":
        setTicksPerSecond(FAST);
        break;
      case "3":
        setTicksPerSecond(FASTER);
        break;
    }
  });

  return (
    <section>
      <TimeOfDay tick={gameState.tick} rounded={!controlsUnlocked} />
      {controlsUnlocked && (
        <div className="rounded-b-md bg-zinc-700 overflow-hidden">
          <menu className="flex gap-0 justify-stretch">
            <SpeedButton
              speed={PAUSED}
              title="Pause game"
              ticksPerSecond={ticksPerSecond}
              setTicksPerSecond={setTicksPerSecond}
            >
              ⏸
            </SpeedButton>
            <button
              className={classNames(
                "align-middle font-sans p-1 tracking-[-0.2em] text-center text-sm grow",
                "hover:bg-white/5",
              )}
              onClick={(e) => {
                applyAction(tickAction);
                e.currentTarget.blur();
              }}
              title="Step forward one tick"
              tabIndex={-1}
            >
              ❯
            </button>
            <SpeedButton
              title="Play at normal speed"
              speed={NORMAL}
              ticksPerSecond={ticksPerSecond}
              setTicksPerSecond={setTicksPerSecond}
            >
              ▶
            </SpeedButton>
            <SpeedButton
              title="Play at fast speed"
              speed={FAST}
              ticksPerSecond={ticksPerSecond}
              setTicksPerSecond={setTicksPerSecond}
            >
              ▶▶
            </SpeedButton>
            <SpeedButton
              title="Play at faster speed"
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

const ticksPerDay = 600;

const TimeOfDay: React.FC<{ tick: number; rounded: boolean }> = ({
  tick,
  rounded,
}) => {
  const day = Math.floor(tick / ticksPerDay);
  const time = tick % ticksPerDay;
  return (
    <div
      className={classNames(
        "font-lumberjack relative block px-2 py-1 overflow-hidden border border-zinc-700",
        rounded ? "rounded-md" : "rounded-t-md border-b-0",
      )}
    >
      <span
        style={{ width: (time / ticksPerDay) * 100 + "%" }}
        className="absolute top-0 bottom-0 left-0 bg-zinc-500 transition-[width] ease-linear"
      />
      <span className="relative">Day {day + 1}</span>
    </div>
  );
};
