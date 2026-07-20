import React, { useState } from "react";
import { useGameState } from "./useGameState";

/** Dev-only state inspector, anchored to the bottom-left corner so it
 * never adds a page scrollbar under the viewport-sized screens. */
export const DebugView: React.FC = () => {
  const gameState = useGameState();
  const [open, setOpen] = useState(false);
  if (process.env.NODE_ENV === "production") {
    return null;
  }
  if (!open) {
    return (
      <div className="fixed bottom-4 left-4 z-40">
        <button onClick={() => setOpen(true)} className="button">
          Debug
        </button>
      </div>
    );
  } else {
    return (
      <pre
        className="fixed bottom-4 left-4 z-40 max-h-[80vh] max-w-lg overflow-y-auto whitespace-pre-wrap text-xs rounded p-2 bg-white/20 cursor-pointer"
        onClick={() => setOpen(false)}
      >
        {JSON.stringify(gameState, null, 2)}
      </pre>
    );
  }
};
