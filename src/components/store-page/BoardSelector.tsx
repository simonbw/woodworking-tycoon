import React, { useMemo, useState } from "react";
import {
  BOARD_DIMENSIONS,
  BoardDimension,
  SPECIES,
  Species,
} from "../../game/Materials";
import { board } from "../../game/board-helpers";
import { getMaterialName } from "../../game/material-helpers";
import { humanizeString } from "../../utils/humanizeString";
import { MaterialIcon } from "../current-cell-info/MaterialIcon";
import { materialMeetsInput } from "../../game/material-helpers";
import { useApplyGameAction, useGameState } from "../useGameState";

export const BoardSelector: React.FC = () => {
  const applyAction = useApplyGameAction();
  const gameState = useGameState();

  const [length, setLength] = useState<BoardDimension>(8);
  const [width, setWidth] = useState<BoardDimension>(4);
  const [thickness, setThickness] = useState<BoardDimension>(4);
  const [species, setSpecies] = useState<Species>("pine");

  const material = useMemo(
    () => board(species, length, width, thickness),
    [length, width, thickness, species],
  );

  const numberOwned = gameState.player.inventory.filter((m) =>
    materialMeetsInput(m, {
      type: ["board"],
      species: [species],
      length: [length],
      width: [width],
      thickness: [thickness],
    }),
  ).length;

  return (
    <section>
      <h2 className="aisle-heading">Custom Cut</h2>
      <div className="product-card">
        <div className="flex gap-3 items-stretch">
          <div className="w-24 flex items-center justify-center">
            <MaterialIcon material={material} size="large" />
          </div>
          <div className="flex flex-col gap-2 grow text-xs">
            <SelectField
              label="Species"
              value={species}
              onChange={(v) => setSpecies(v as Species)}
              options={SPECIES.map((s) => ({
                value: s,
                label: humanizeString(s),
              }))}
            />
            <div>
              <div className="font-condensed uppercase tracking-[0.15em] text-[0.65rem] text-ink-fade mb-0.5">
                Dimensions
              </div>
              <div className="flex items-center gap-1">
                <DimensionSelect
                  value={length}
                  onChange={setLength}
                  suffix="'"
                />
                <span className="text-ink-fade">×</span>
                <DimensionSelect
                  value={width}
                  onChange={setWidth}
                  suffix='"'
                />
                <span className="text-ink-fade">×</span>
                <DimensionSelect
                  value={thickness}
                  onChange={setThickness}
                  suffix="/4"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-between items-end mt-3 pt-2 border-t border-ink-black/15">
          <div>
            <div className="font-stencil text-sm uppercase tracking-wide text-ink-black leading-none">
              {getMaterialName(material)}
            </div>
            <div className="text-xs text-ink-fade tabular-nums mt-1">
              {numberOwned} owned
            </div>
          </div>
          <button
            className="bg-store-orange hover:bg-store-orange-dark text-white font-stencil uppercase tracking-widest text-xs px-3 py-1 rounded-sm shadow"
            onClick={() => {
              applyAction((state) => ({
                ...state,
                player: {
                  ...state.player,
                  inventory: [...state.player.inventory, material],
                },
              }));
            }}
          >
            Buy
          </button>
        </div>
      </div>
    </section>
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

const DimensionSelect: React.FC<{
  value: BoardDimension;
  onChange: (value: BoardDimension) => void;
  suffix: string;
}> = ({ value, onChange, suffix }) => (
  <select
    className="bg-paper-ivory border border-ink-black/30 text-ink-black px-1.5 py-0.5 rounded font-mono text-xs"
    value={value}
    onChange={(e) => onChange(parseInt(e.target.value) as BoardDimension)}
  >
    {BOARD_DIMENSIONS.map((dim) => (
      <option key={dim} value={dim}>
        {dim}
        {suffix}
      </option>
    ))}
  </select>
);
