import React, { ReactNode, createContext, useContext, useState } from "react";

/** How fast the simulation runs. The player has no speed control — the
 * clock is either running at this rate or stopped. */
export const TICKS_PER_SECOND = 5;

/**
 * Whether the world is stopped, lifted out of Ticker so more than one
 * system can see it: Ticker drives the simulation from it, and the shop
 * floor's continuous movement freezes the player's body while it reads
 * true — pausing stops the world, woodworker included.
 *
 * Only the pause menu sets this. There is no speed control: the shop runs
 * at one pace, and the journal and manual are objects you look at
 * while standing in it.
 */
const pauseContext = createContext<
  | {
      paused: boolean;
      setPaused: React.Dispatch<React.SetStateAction<boolean>>;
    }
  | undefined
>(undefined);

export const PauseProvider: React.FC<{ children?: ReactNode }> = ({
  children,
}) => {
  const [paused, setPaused] = useState(false);
  return (
    <pauseContext.Provider value={{ paused, setPaused }}>
      {children}
    </pauseContext.Provider>
  );
};

export function usePaused() {
  const value = useContext(pauseContext);
  if (value === undefined) {
    throw new Error("usePaused must be used within a PauseProvider");
  }
  return value;
}
