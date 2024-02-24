import React from "react";
import { NavBar } from "./NavBar";
import { useUiMode } from "./UiMode";
import { MaterialPileSprite } from "./shop-view/MaterialPileSprite";

export const StorePage: React.FC = () => {
  const { setMode } = useUiMode();

  return (
    <main className="p-8 space-y-6">
      <NavBar />

      <div className="grid grid-cols-3">
        <section>
          <h2 className="section-heading">Materials</h2>
          <ul>
            <li>
              <svg
                viewBox="-50 -50 100 100"
                className="w-10 h-10 bg-white/10 rounded"
              >
                <MaterialPileSprite
                  material={{ id: "store-pallet", type: "pallet" }}
                />
              </svg>

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
