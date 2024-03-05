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
    [length, width, thickness, species]
  );

  const numberOwned = gameState.player.inventory.filter((m) =>
    materialMeetsInput(m, {
      type: ["board"],
      species: [species],
      length: [length],
      width: [width],
      thickness: [thickness],
    })
  ).length;

  return (
    <div className="max-w-fit">
      <h2 className="section-heading">Boards</h2>
      <div className="flex gap-4 items-end mt-2">
        <div className="w-28">
          <MaterialIcon material={material} size="large" />
        </div>
        <div className="flex flex-col gap-1 h-28 justify-between">
          <label className="inline-flex flex-col">
            <span>Species</span>
            <select
              onChange={(event) => setSpecies(event.target.value as Species)}
              value={species}
            >
              {SPECIES.map((species) => (
                <option key={species} value={species}>
                  {humanizeString(species)}
                </option>
              ))}
            </select>
          </label>
          <label className="inline-flex flex-col">
            <span>Dimensions</span>
            <div className="flex items-center gap-1">
              <select
                className=""
                onChange={(event) =>
                  setLength(parseInt(event.target.value) as BoardDimension)
                }
                value={length}
              >
                {BOARD_DIMENSIONS.map((length) => (
                  <option key={length} value={length}>
                    {length}
                    {"'"}
                  </option>
                ))}
              </select>
              ×
              <select
                onChange={(event) =>
                  setWidth(parseInt(event.target.value) as BoardDimension)
                }
                value={width}
              >
                {BOARD_DIMENSIONS.map((width) => (
                  <option key={width} value={width}>
                    {width}
                    {'"'}
                  </option>
                ))}
              </select>
              ×
              <select
                onChange={(event) =>
                  setThickness(parseInt(event.target.value) as BoardDimension)
                }
                value={thickness}
              >
                {BOARD_DIMENSIONS.map((thickness) => (
                  <option key={thickness} value={thickness}>
                    {thickness}/4
                  </option>
                ))}
              </select>
            </div>
          </label>
        </div>
      </div>
      <div className="flex justify-between items-center py-4 gap-4">
        <span className="inline-flex flex-col">
          <span>{getMaterialName(material)}</span>
          <span className="text-zinc-500 text-sm tabular-nums">
            {numberOwned} owned
          </span>
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
      </div>
    </div>
  );
};
