import { Graphics as PixiGraphics } from "@pixi/graphics";
import { Container, Graphics, Sprite } from "@pixi/react";
import React, { useCallback, useRef } from "react";
import { MaterialPile } from "../../game/GameState";
import { FinishedProduct, MaterialInstance } from "../../game/Materials";
import { Vector } from "../../game/Vectors";
import { rNormal, rUniform } from "../../utils/randUtils";
import { BoardSprite } from "../material-sprites/BoardSprite";
import { colorBySpecies } from "./colorBySpecies";

export const MaterialPilesSprite: React.FC<{
  materialPiles: ReadonlyArray<MaterialPile>;
}> = ({ materialPiles }) => {
  // TODO: These positions need to match up with each material, not just the index in the array
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
        <Container key={`${x},${y}`} x={x} y={y} angle={angle}>
          <MaterialSprite material={materialPile.material} />
        </Container>
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

export const MaterialSprite: React.FC<{
  material: MaterialInstance;
}> = ({ material }) => {
  switch (material.type) {
    case "board":
      return <BoardSprite board={material} />;

    case "pallet":
      return (
        <Sprite
          image={"/images/pallet.png"}
          anchor={{ x: 0.5, y: 0.5 }}
          width={85}
          height={85}
        />
      );

    case "jewelryBox":
      return <FinishedBoxSprite material={material as FinishedProduct} />;

    default:
      return <DefaultMaterialPileSprite />;
  }
};

export const PIXELS_PER_INCH = 2;

const DefaultMaterialPileSprite: React.FC = () => {
  return (
    <Graphics
      draw={useCallback((g: PixiGraphics) => {
        g.clear();
        g.beginFill(0);
        g.drawRect(-10, -10, 20, 20);
        g.endFill();
      }, [])}
    />
  );
};

const FinishedBoxSprite: React.FC<{
  material: FinishedProduct;
}> = ({ material }) => {
  return (
    <Graphics
      draw={useCallback((g: PixiGraphics) => {
        g.clear();
        g.beginFill(colorBySpecies[material.species]);
        g.drawRect(-10, -10, 20, 20);
        g.endFill();
      }, [])}
    />
  );
};
