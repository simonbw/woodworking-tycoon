import React from "react";
import { useUiMode } from "./UiMode";
import { ShopView } from "./shop-view/ShopView";
import { useGameState } from "./useGameState";
import { groupBy } from "../utils/arrayUtils";

export const LayoutPage: React.FC = () => {
  const { setMode } = useUiMode();
  return (
    <main className="p-8 space-y-6">
      <header className="flex gap-2 items-center">
        <img src="/images/favicon-3.png" className="relative w-16 top-1" />
        <h1 className="font-heading font-bold text-5xl tracking-wide">
          Layout
        </h1>
      </header>

      <button className="button" onClick={() => setMode({ mode: "normal" })}>
        Back
      </button>

      <div className="grid grid-cols-2">
        <section>
          <ShopView />
        </section>
        <StorageSection />
      </div>
    </main>
  );
};

const StorageSection: React.FC = () => {
  const storage = useGameState().gameState.storage;
  const groupedMachines = [
    ...groupBy(storage.machines, (machine) => machine.id).values(),
  ];
  return (
    <section>
      <h2 className="section-heading">Storage</h2>
      <ul>
        {groupedMachines.map((machines) => (
          <li key={machines[0].id}>
            <span>{machines[0].name}</span>
            {machines.length > 1 && <span>x{machines.length}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
};
