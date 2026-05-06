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
    <section className="max-w-fit">
      <CalendarPage tick={gameState.tick} />
      {controlsUnlocked && (
        <div className="bg-paper-cream border-x border-b border-paper-manila-edge rounded-b-sm overflow-hidden">
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
              className="p-1 text-center text-sm grow font-condensed text-ink-black/70 hover:bg-ink-black/10"
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

const CalendarPage: React.FC<{ tick: number }> = ({ tick }) => {
  const day = Math.floor(tick / ticksPerDay);
  const time = tick % ticksPerDay;
  const dayPercent = (time / ticksPerDay) * 100;

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
