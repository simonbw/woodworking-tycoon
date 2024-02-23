import React, { useRef } from "react";
import { MaterialPile } from "../../game/GameState";
import { Species } from "../../game/Materials";
import { Vector } from "../../game/Vectors";
import { rNormal, rUniform } from "../../utils/randUtils";
import { BoardSprite } from "../material-sprites/BoardSprite";
import { PalletSprite } from "../material-sprites/PalletSprite";

export const MaterialPilesSprite: React.FC<{
  materialPiles: ReadonlyArray<MaterialPile>;
}> = ({ materialPiles }) => {
  const positions = useRef<{ position: Vector; angle: number }[]>([]);

  while (positions.current.length < materialPiles.length) {
    positions.current.push(makePosition());
  }
  while (positions.current.length > materialPiles.length) {
    positions.current.pop();
  }

  const zipped = materialPiles.map((materialPile, i) => ({
    materialPile,
    ...positions.current[i],
  }));

  return (
    <>
      {zipped.map(({ position: [x, y], angle, materialPile }, i) => (
        <g
          key={`${x},${y}`}
          transform={`translate(${x} ${y}) rotate(${angle})`}
        >
          <LocalMaterialPileSprite materialPile={materialPile} />
        </g>
      ))}
    </>
  );
};

function makePosition(): { position: Vector; angle: number } {
  return {
    position: [rNormal(50, 1), rNormal(50, 1)],
    angle: rUniform(0, 360),
  };
}

export const classNameBySpecies: Record<Species, string> = {
  pallet: "fill-amber-400",
  cherry: "fill-brown-500",
  mahogany: "fill-brown-800",
  maple: "fill-yellow-300",
  oak: "fill-brown-300",
  pine: "fill-brown-300",
  walnut: "fill-brown-900",
};

const LocalMaterialPileSprite: React.FC<{
  materialPile: MaterialPile;
}> = ({ materialPile }) => {
  switch (materialPile.material.type) {
    case "board":
      return <BoardSprite board={materialPile.material} />;

    case "pallet":
      return <PalletSprite />;

    case "jewelryBox":
      return (
        <rect
          width={20}
          height={20}
          className={classNameBySpecies[materialPile.material.species]}
        />
      );

    default:
      return (
        <circle
          cx={0}
          cy={0}
          r={10}
          className="fill-red-500 drop-shadow"
          shapeRendering="geometricPrecision"
        />
      );
  }
};

export const PIXELS_PER_INCH = 2;
