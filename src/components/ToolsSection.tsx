import React from "react";
import { useGameState } from "./useGameState";

export const ToolsSection: React.FC = () => {
  const { gameState } = useGameState();

  return (
    <section>
      <h2 className="section-heading">Tools</h2>
      <ul className="space-y-2">
        {gameState.tools.map((tool) => (
          <li key={tool.name}>{tool.name}</li>
        ))}
      </ul>
    </section>
  );
};
