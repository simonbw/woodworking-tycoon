import React from "react";
import { groupBy } from "../utils/arrayUtils";
import { NavBar } from "./NavBar";
import { useUiMode } from "./UiMode";
import { ShopView } from "./shop-view/ShopView";
import { useGameState } from "./useGameState";

export const LayoutPage: React.FC = () => {
  const { setMode } = useUiMode();
  return (
    <main className="p-8 space-y-6">
      <NavBar />

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
  const gameState = useGameState();
  const groupedMachines = [
    ...groupBy(gameState.storage.machines, (machine) => machine.id).values(),
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
