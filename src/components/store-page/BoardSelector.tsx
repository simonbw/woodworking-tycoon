import React, { useMemo, useState } from "react";
import { Species } from "../../game/Materials";
import { board } from "../../game/board-helpers";
import { buyMaterialAction } from "../../game/game-actions/store-actions";
import { getBoardBuyPrice } from "../../game/material-values";
import { getMaterialName, materialMeetsInput } from "../../game/material-helpers";
import { humanizeString } from "../../utils/humanizeString";
import { LUMBER_SKUS, LumberSku, STORE_SPECIES } from "../../game/lumberStock";
import { MaterialIcon } from "../current-cell-info/MaterialIcon";
import { useApplyGameAction, useGameState } from "../useGameState";

/**
 * The lumber rack: a few common sizes per species. No custom cutting —
 * ripping, crosscutting, and planing stock to size is the player's job.
 */
export const BoardSelector: React.FC = () => {
  const [species, setSpecies] = useState<Species>("pine");

  return (
    <section>
      <h2 className="aisle-heading">Lumber Rack</h2>
      <div className="mb-2">
        <SelectField
          label="Species"
          value={species}
          onChange={(v) => setSpecies(v as Species)}
          options={STORE_SPECIES.map((s) => ({
            value: s,
            label: humanizeString(s),
          }))}
        />
      </div>
      <ul className="space-y-2">
        {LUMBER_SKUS.map((sku) => (
          <LumberSkuCard
            key={`${sku.length}x${sku.width}x${sku.thickness}`}
            sku={sku}
            species={species}
          />
        ))}
      </ul>
      <p className="text-xs text-ink-fade font-typewriter mt-2">
        We stock what we stock. Need a different size? That's what your saws
        are for. Boards wider than 8"? Glue 'em up yourself — that's
        woodworking.
      </p>
    </section>
  );
};

const LumberSkuCard: React.FC<{ sku: LumberSku; species: Species }> = ({
  sku,
  species,
}) => {
  const applyAction = useApplyGameAction();
  const gameState = useGameState();

  const material = useMemo(
    () => board(species, sku.length, sku.width, sku.thickness),
    [species, sku],
  );
  const price = getBoardBuyPrice(material);

  const numberOwned = gameState.player.inventory.filter((m) =>
    materialMeetsInput(m, {
      type: ["board"],
      species: [species],
      length: [sku.length],
      width: [sku.width],
      thickness: [sku.thickness],
    }),
  ).length;

  return (
    <li className="product-card flex items-center gap-3">
      <div className="w-12 flex items-center justify-center">
        <MaterialIcon material={material} />
      </div>
      <div className="grow">
        <div className="font-stencil text-sm uppercase tracking-wide text-ink-black leading-none">
          {getMaterialName(material)}
        </div>
        <div className="text-xs text-ink-fade tabular-nums mt-1">
          {numberOwned > 0 && (
            <span className="text-store-orange-dark font-semibold">
              {numberOwned} owned ·{" "}
            </span>
          )}
          In stock
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="price-tag tabular-nums">${price.toFixed(2)}</span>
        <button
          className="bg-store-orange hover:bg-store-orange-dark disabled:bg-store-concrete-dark disabled:text-ink-fade text-white font-stencil uppercase tracking-widest text-xs px-3 py-1 rounded-sm shadow"
          disabled={gameState.money < price}
          onClick={() =>
            applyAction(
              buyMaterialAction(
                board(species, sku.length, sku.width, sku.thickness),
                price,
              ),
            )
          }
        >
          Buy
        </button>
      </div>
    </li>
  );
};

const SelectField: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
}> = ({ label, value, onChange, options }) => (
  <label className="flex flex-col">
    <span className="font-condensed uppercase tracking-[0.15em] text-[0.65rem] text-ink-fade leading-none mb-0.5">
      {label}
    </span>
    <select
      className="bg-paper-ivory border border-ink-black/30 text-ink-black px-2 py-0.5 rounded font-condensed"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  </label>
);
