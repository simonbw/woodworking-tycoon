import React, { useState } from "react";
import { useGameState } from "./useGameState";

export const DebugView: React.FC = () => {
  const gameState = useGameState();
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <div className="p-8">
        <button onClick={() => setOpen(true)} className="button">
          Debug
        </button>
      </div>
    );
  } else {
    return (
      <pre
        className="whitespace-pre-wrap text-xs rounded p-2 bg-white/20 cursor-pointer"
        onClick={() => setOpen(false)}
      >
        {JSON.stringify(gameState, null, 2)}
      </pre>
    );
  }
};
