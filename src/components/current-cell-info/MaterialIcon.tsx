import { Container, Stage } from "@pixi/react";
import React, { ReactNode } from "react";
import { MaterialInstance } from "../../game/Materials";
import { MaterialSprite } from "../material-sprites/MaterialSprite";
import { CELL_SIZE, PIXELS_PER_INCH } from "../shop-view/shop-scale";
import {
  colorBySheetGoodKind,
  colorBySpecies,
} from "../shop-view/colorBySpecies";
import { classNames } from "../../utils/classNames";

export const SimpleSpriteStage: React.FC<{
  children: ReactNode;
  scale?: number;
}> = ({ children, scale = 0.5 }) => {
  return (
    <Stage
      width={CELL_SIZE * scale}
      height={CELL_SIZE * scale}
      raf={false}
      options={{
        backgroundAlpha: 0,
        antialias: true,
      }}
      className="rounded bg-zinc-700 p-0.5"
    >
      <Container
        y={(CELL_SIZE / 2) * scale}
        x={(CELL_SIZE / 2) * scale}
        scale={scale}
      >
        {children}
      </Container>
    </Stage>
  );
};

// TODO: Optimize this a lot

const sizeToScale = {
  small: 0.25,
  medium: 0.5,
  large: 1,
  xl: 2,
};

export const MaterialIcon: React.FC<{
  material: MaterialInstance;
  size?: keyof typeof sizeToScale;
  quantity?: number;
}> = ({ material, size = "medium", quantity }) => {
  switch (material.type) {
    // Make the board with SVG so we don't have to use Pixi to render it
    case "board": {
      const board = material;
      const width = board.width * PIXELS_PER_INCH;
      const height = board.length * 12 * PIXELS_PER_INCH;
      const depth = (board.thickness * PIXELS_PER_INCH) / 4;

      return (
        <Wrapper size={size} quantity={quantity}>
          <svg viewBox={`0 0 ${CELL_SIZE} ${CELL_SIZE}`} className="w-full">
            <rect
              x={CELL_SIZE / 2 - width / 2}
              y={CELL_SIZE / 2 - height / 2}
              width={width}
              height={height}
              fill={colorBySpecies[board.species].primary}
            />
            <rect
              x={CELL_SIZE / 2 + width / 2}
              y={CELL_SIZE / 2 - height / 2}
              width={depth}
              height={height}
              fill={colorBySpecies[board.species].secondary}
            />
          </svg>
        </Wrapper>
      );
    }

    case "plywood": {
      const board = material;
      const width = board.width * 12 * PIXELS_PER_INCH;
      const height = board.length * 12 * PIXELS_PER_INCH;
      const depth = (board.thickness * PIXELS_PER_INCH) / 4;

      return (
        <Wrapper size={size}>
          <svg viewBox={`0 0 ${CELL_SIZE} ${CELL_SIZE}`} className="w-full">
            <rect
              x={CELL_SIZE / 2 - width / 2}
              y={CELL_SIZE / 2 - height / 2}
              width={width}
              height={height}
              fill={colorBySheetGoodKind[board.kind].primary}
            />
            <rect
              x={CELL_SIZE / 2 + width / 2 - depth}
              y={CELL_SIZE / 2 - height / 2}
              width={depth}
              height={height}
              fill={"#00000033"}
            />
          </svg>
        </Wrapper>
      );
    }

    case "pallet":
      return (
        <Wrapper size={size}>
          <img src="/images/pallet.png" />
        </Wrapper>
      );

    default:
      return (
        <SimpleSpriteStage scale={sizeToScale[size]}>
          <MaterialSprite material={material} />
        </SimpleSpriteStage>
      );
  }
};

const sizeToClassname = {
  small: "w-8 p-0.5",
  medium: "w-12 p-1",
  large: "w-28 p-1.5",
  xl: "w-64 p-2",
};

const Wrapper: React.FC<{
  children: ReactNode;
  size: keyof typeof sizeToClassname;
  quantity?: number;
}> = ({ children, size, quantity }) => {
  return (
    <span
      className={classNames(
        "rounded bg-zinc-700 inline-block overflow-hidden relative",
        sizeToClassname[size]
      )}
    >
      {children}
      {quantity && (
        <span className="absolute bottom-0.5 right-0.5 text-xs select-none">
          {quantity}
        </span>
      )}
    </span>
  );
};
