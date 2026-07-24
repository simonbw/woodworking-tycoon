import React from "react";
import { HintSurfaceContext } from "./Kbd";

/**
 * The dark chrome pill that in-world hint clusters render into — the
 * player's verb hints, a targeted machine's chips, the door's "head out".
 * One `<li>` per row. Wraps its rows in the chrome surface so key caps
 * and muted text stay readable on the dark background (see Kbd.tsx).
 */
export const HintList: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <HintSurfaceContext.Provider value="chrome">
    <ul className="flex flex-col items-center gap-0.5 rounded bg-ink-black/70 px-2 py-1 text-center font-condensed text-[0.65rem] uppercase tracking-[0.1em] text-paper-manila/90 whitespace-nowrap">
      {children}
    </ul>
  </HintSurfaceContext.Provider>
);
