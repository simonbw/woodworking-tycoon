import React from "react";
import { NavBar } from "./NavBar";
import { useUiMode } from "./UiMode";
import { MaterialIcon } from "./current-cell-info/SimpleSpriteStage";

export const StorePage: React.FC = () => {
  const { setMode } = useUiMode();

  return (
    <main className="p-8 space-y-6">
      <NavBar />

      <div className="grid grid-cols-3">
        <section>
          <h2 className="section-heading">Materials</h2>
          <ul>
            <li className="flex gap-2 items-center">
              <MaterialIcon material={{ id: "store-pallet", type: "pallet" }} />

              <span>Pallet</span>

              <button className="button">Buy</button>
            </li>
          </ul>
        </section>
        <section>
          <h2 className="section-heading">Machines</h2>
        </section>
        <section>
          <h2 className="section-heading">Sell</h2>
        </section>
      </div>
    </main>
  );
};
