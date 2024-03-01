import React, { useMemo, useState } from "react";
import {
  BOARD_DIMENSIONS,
  Board,
  BoardDimension,
  MaterialInstance,
  SPECIES,
  Species,
} from "../game/Materials";
import { getMaterialName } from "../game/getMaterialName";
import { makeMaterial } from "../game/material-helpers";
import { NavBar } from "./NavBar";
import { MaterialIcon } from "./current-cell-info/MaterialIcon";
import { humanizeString } from "../utils/humanizeString";

export const StorePage: React.FC = () => {
  const [materialsForSale, setMaterialsForSale] = useState<
    ReadonlyArray<MaterialInstance>
  >(() => {
    return [makeMaterial({ type: "pallet" })];
  });

  return (
    <main className="p-8 space-y-6">
      <NavBar />

      <div className="grid grid-cols-3">
        <section>
          <h2 className="section-heading">Materials</h2>
          <ul className="space-y-1">
            {materialsForSale.map((material) => (
              <li key={material.id} className="flex gap-2 items-center">
                <MaterialIcon material={material} />
                <span>{getMaterialName(material)}</span>
                <button className="button">Buy</button>
              </li>
            ))}

            <BoardSelector />
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

const BoardSelector: React.FC = () => {
  const [state, setState] = useState<Omit<Board, "id" | "type">>({
    length: 1,
    width: 1,
    thickness: 1,
    species: "pine",
  });

  const material = useMemo(
    () => makeMaterial({ ...state, type: "board" }),
    [state]
  );

  return (
    <div>
      <h3>Boards</h3>
      <label className="inline-flex flex-col">
        <span>Species</span>
        <select
          className="bg-zinc-700 p-1 rounded"
          onChange={(event) => {
            setState((state) => ({
              ...state,
              species: event.target.value as Species,
            }));
          }}
        >
          {SPECIES.map((species) => (
            <option key={species} value={species}>
              {humanizeString(species)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Length</span>
        <select
          className=""
          onChange={(event) => {
            setState((state) => ({
              ...state,
              length: parseInt(event.target.value) as BoardDimension,
            }));
          }}
        >
          {BOARD_DIMENSIONS.map((dimension) => (
            <option key={dimension} value={dimension}>
              {dimension}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Width</span>
        <select
          onChange={(event) => {
            setState((state) => ({
              ...state,
              width: parseInt(event.target.value) as BoardDimension,
            }));
          }}
        >
          {BOARD_DIMENSIONS.map((dimension) => (
            <option key={dimension} value={dimension}>
              {dimension}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Thickness</span>
        <select
          onChange={(event) => {
            setState((state) => ({
              ...state,
              thickness: parseInt(event.target.value) as BoardDimension,
            }));
          }}
        >
          {BOARD_DIMENSIONS.map((dimension) => (
            <option key={dimension} value={dimension}>
              {dimension}
            </option>
          ))}
        </select>
      </label>
      <MaterialIcon material={material} />
    </div>
  );
};
