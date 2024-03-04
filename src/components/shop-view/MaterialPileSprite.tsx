import { Container } from "@pixi/react";
import React from "react";
import { MaterialPile } from "../../game/GameState";
import { CELL_SIZE } from "./shop-scale";
import { MaterialSprite } from "../material-sprites/MaterialSprite";

export const IMAGE_PIXELS_PER_INCH = 8;

export const MaterialPilesSprite: React.FC<{
  materialPiles: ReadonlyArray<MaterialPile>;
}> = ({ materialPiles }) => {
  return (
    <>
      {materialPiles.map((materialPile, i) => (
        <Container key={i} x={CELL_SIZE / 2} y={CELL_SIZE / 2} angle={i * 10}>
          <MaterialSprite material={materialPile.material} />
        </Container>
      ))}
    </>
  );
};
