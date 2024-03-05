import React, { useState } from "react";
import { MaterialInstance } from "../../game/Materials";
import { getMaterialName, makeMaterial } from "../../game/material-helpers";
import { MaterialIcon } from "../current-cell-info/MaterialIcon";
import { materialMeetsInput } from "../../game/material-helpers";
import { materialToInput } from "../../game/material-helpers";
import { useApplyGameAction, useGameState } from "../useGameState";

interface MaterialSaleInfo {
  material: MaterialInstance;
  price: number;
}

export const StoreMaterialSection: React.FC = () => {
  const [materialsForSale] = useState<ReadonlyArray<MaterialSaleInfo>>(() => {
    return [{ material: makeMaterial({ type: "pallet" }), price: 0 }];
  });
  return (
    <section>
      <h2 className="section-heading">Materials</h2>
      <ul className="space-y-2 mt-2">
        {materialsForSale.map((info) => (
          <MaterialsListItem key={info.material.id} {...info} />
        ))}
      </ul>
    </section>
  );
};

const MaterialsListItem: React.FC<MaterialSaleInfo> = ({ material, price }) => {
  const applyAction = useApplyGameAction();
  const gameState = useGameState();

  const numberOwned = gameState.player.inventory.filter((m) =>
    materialMeetsInput(m, materialToInput(material))
  ).length;

  return (
    <li className="flex gap-2 items-center">
      <MaterialIcon material={material} />
      <span className="inline-flex flex-col">
        <span className="flex gap-4">
          <span>{getMaterialName(material)}</span>
          <span>${price.toFixed(2)}</span>
        </span>
        <span className="text-zinc-500 text-sm">{numberOwned} owned</span>
      </span>
      <button
        className="button"
        onClick={() => {
          applyAction((state) => {
            return {
              ...state,
              player: {
                ...state.player,
                inventory: [...state.player.inventory, material],
              },
            };
          });
        }}
      >
        Buy
      </button>
    </li>
  );
};
