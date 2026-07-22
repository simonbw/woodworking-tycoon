import React from "react";
import { MaterialInstance } from "../game/Materials";
import {
  describeStockDimensionsPlain,
  getMaterialName,
  getMaterialState,
} from "../game/material-helpers";
import { Tooltip } from "./Tooltip";

/**
 * The two-line material row label: the name (identity) with the state
 * line — surface, milling, ends — faded underneath. Hovering the name of
 * dimensioned stock spells its size out in plain inches (see
 * docs/lumber-naming.md).
 */
export const MaterialLabel: React.FC<{ material: MaterialInstance }> = ({
  material,
}) => {
  const state = getMaterialState(material);
  return (
    <span className="grow leading-tight">
      <Tooltip content={describeStockDimensionsPlain(material)}>
        <span className="text-sm">{getMaterialName(material)}</span>
      </Tooltip>
      {state && <span className="block text-xs text-ink-fade">{state}</span>}
    </span>
  );
};
