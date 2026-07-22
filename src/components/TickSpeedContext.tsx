import React, { ReactNode, createContext, useContext, useState } from "react";

export const TICK_SPEED_PAUSED = 0;
export const TICK_SPEED_NORMAL = 5;
export const TICK_SPEED_FAST = 10;
export const TICK_SPEED_FASTER = 20;

/**
 * The game clock's speed, lifted out of Ticker so more than one system
 * can see it: Ticker drives the simulation from it, and the shop floor's
 * continuous movement freezes the player's body while it reads 0 —
 * pausing stops the world, woodworker included.
 */
const tickSpeedContext = createContext<
  | {
      ticksPerSecond: number;
      setTicksPerSecond: React.Dispatch<React.SetStateAction<number>>;
    }
  | undefined
>(undefined);

export const TickSpeedProvider: React.FC<{ children?: ReactNode }> = ({
  children,
}) => {
  const [ticksPerSecond, setTicksPerSecond] =
    useState<number>(TICK_SPEED_NORMAL);
  return (
    <tickSpeedContext.Provider value={{ ticksPerSecond, setTicksPerSecond }}>
      {children}
    </tickSpeedContext.Provider>
  );
};

export function useTickSpeed() {
  const value = useContext(tickSpeedContext);
  if (value === undefined) {
    throw new Error("useTickSpeed must be used within a TickSpeedProvider");
  }
  return value;
}
