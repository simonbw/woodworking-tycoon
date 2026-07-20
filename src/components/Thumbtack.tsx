import React from "react";

/** Red pin holding a piece of paper to the job board's cork. */
export const Thumbtack: React.FC = () => (
  <span
    className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-ink-red shadow-md ring-1 ring-ink-red/50"
    aria-hidden
  />
);
