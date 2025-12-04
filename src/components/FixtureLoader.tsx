import React, { useState } from "react";
import { useApplyGameAction } from "./useGameState";

export const FixtureLoader: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const updateGameState = useApplyGameAction();

  // Don't show in production
  if (process.env.NODE_ENV === "production") {
    return null;
  }

  const loadFixture = (fixtureName: string) => {
    const fixtures = (window as any).__TEST_FIXTURES__;
    if (fixtures && fixtures[fixtureName]) {
      updateGameState(() => fixtures[fixtureName]);
      console.log(`Loaded fixture: ${fixtureName}`);
    } else {
      console.error(`Fixture not found: ${fixtureName}`);
    }
  };

  const getAvailableFixtures = (): string[] => {
    const fixtures = (window as any).__TEST_FIXTURES__;
    return fixtures ? Object.keys(fixtures) : [];
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="button fixed bottom-4 right-4 border-purple-600"
        title="Load test fixtures"
      >
        🧪 Fixtures
      </button>
    );
  }

  const fixtures = getAvailableFixtures();

  return (
    <div className="fixed bottom-4 right-4 bg-zinc-900 border-2 border-purple-600 rounded-lg shadow-2xl p-4 max-w-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-purple-400 font-mono font-bold">Test Fixtures</h3>
        <button
          onClick={() => setIsOpen(false)}
          className="text-zinc-400 hover:text-white"
        >
          ✕
        </button>
      </div>

      <div className="space-y-2">
        {fixtures.length === 0 ? (
          <p className="text-zinc-400 text-sm">No fixtures available</p>
        ) : (
          fixtures.map((fixtureName) => (
            <button
              key={fixtureName}
              onClick={() => loadFixture(fixtureName)}
              className="w-full text-left px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded border border-zinc-700 hover:border-purple-500 transition-colors"
            >
              <div className="text-sm font-mono text-zinc-100">
                {fixtureName.replace(/-/g, " ")}
              </div>
            </button>
          ))
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-zinc-700">
        <div className="text-xs text-zinc-500 font-mono">
          Console commands:
          <div className="mt-1 text-zinc-400">
            __UPDATE_GAME_STATE__(fn)
            <br />
            __GET_GAME_STATE__()
          </div>
        </div>
      </div>
    </div>
  );
};
