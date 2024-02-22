import React from "react";
import { Machine } from "../../game/GameState";
import { rotateVec, translateVec } from "../../game/Vectors";
import { getMachineCells } from "../useGameHelpers";
import { MACHINE_OVERHANG } from "./ShopView";

export const MachineView: React.FC<{ machinePlacement: Machine }> = ({
  machinePlacement,
}) => {
  const cells = getMachineCells(machinePlacement);

  const [operatorX, operatorY] = translateVec(
    rotateVec(
      machinePlacement.type.operationPosition,
      machinePlacement.rotation
    ),
    machinePlacement.position
  );

  return (
    <>
      {cells.map(([x, y]) => (
        <rect
          key={`${x}-${y}`}
          x={x - MACHINE_OVERHANG}
          y={y - MACHINE_OVERHANG}
          width={1 + MACHINE_OVERHANG * 2}
          height={1 + MACHINE_OVERHANG * 2}
          className={
            machinePlacement.type.className ?? "fill-amber-600 drop-shadow"
          }
        />
      ))}
      <defs>
        <radialGradient id="operator-position-gradient">
          <stop offset="0%" className="stop-sky-400/20" />
          <stop offset="75%" className="stop-sky-400/60" />
          <stop offset="80%" className="stop-sky-400/20" />
          <stop offset="100%" className="stop-sky-400/0" />
        </radialGradient>
      </defs>
      <circle
        cx={0.5}
        cy={0.5}
        fill="url(#operator-position-gradient)"
        className="opacity-20"
        r={0.48}
        style={{ transform: `translate(${operatorX}px, ${operatorY}px)` }}
      />
    </>
  );
};
