import React, { ReactNode, useEffect, useState } from "react";
import { tickAction } from "../game/game-actions/tickAction";
import { classNames } from "../utils/classNames";
import { useApplyGameAction, useGameState } from "./useGameState";

const PAUSED = 0;
const NORMAL = 2;
const FAST = 4;
const FASTER = 20;

export const Ticker: React.FC = () => {
  const gameState = useGameState();
  const applyAction = useApplyGameAction();
  const [ticksPerSecond, setTicksPerSecond] = useState<number>(FAST); // [1, 2, 3, 4

  useEffect(() => {
    const interval = setInterval(() => {
      if (ticksPerSecond > 0) {
        applyAction(tickAction);
      }
    }, 1000 / ticksPerSecond);
    return () => clearInterval(interval);
  }, [ticksPerSecond]);

  const speedButton: React.FC<{
    speed: number;
    title: string;
    children: ReactNode;
  }> = ({ speed, children, title }) => {
    return (
      <button
        className={classNames(
          "align-middle font-sans p-1 tracking-[-0.2em] text-center text-sm grow",
          "hover:bg-white/5",
          ticksPerSecond === speed ? "bg-white/10" : "bg-transparent"
        )}
        onClick={() => setTicksPerSecond(speed)}
        title={title}
      >
        {children}
      </button>
    );
  };

  return (
    <section>
      <TimeOfDay tick={gameState.tick} />
      <div className="rounded-b-md bg-zinc-700 overflow-hidden">
        <menu className="flex gap-0 justify-stretch">
          {speedButton({
            speed: PAUSED,
            title: "Pause game",
            children: "⏸",
          })}
          <button
            className={classNames(
              "align-middle font-sans p-1 tracking-[-0.2em] text-center text-sm grow",
              "hover:bg-white/5"
            )}
            onClick={() => applyAction(tickAction)}
            title="Step forward one tick"
          >
            ❯
          </button>
          {speedButton({
            title: "Play at normal speed",
            speed: NORMAL,
            children: "▶",
          })}
          {speedButton({
            title: "Play at fast speed",
            speed: FAST,
            children: "▶▶",
          })}
          {speedButton({
            title: "Play at faster speed",
            speed: FASTER,
            children: "▶▶▶",
          })}
        </menu>
      </div>
    </section>
  );
};

const ticksPerDay = 100;

const TimeOfDay: React.FC<{ tick: number }> = ({ tick }) => {
  const day = Math.floor(tick / ticksPerDay);
  const time = tick % ticksPerDay;
  return (
    <div className="font-lumberjack relative block px-2 py-1 rounded-t-md overflow-hidden border-t border-x border-zinc-700">
      <span
        style={{ width: (time / ticksPerDay) * 100 + "%" }}
        className="absolute top-0 bottom-0 left-0 bg-zinc-500 transition-[width] ease-linear"
      />
      <span className="relative">Day {day + 1}</span>
    </div>
  );
};
