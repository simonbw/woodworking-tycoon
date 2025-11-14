import { Application } from "@pixi/react";
import React, { ReactNode } from "react";
import { MaterialInstance } from "../../game/Materials";
import { MaterialSprite } from "../material-sprites/MaterialSprite";
import { PIXELS_PER_CELL, PIXELS_PER_INCH } from "../shop-view/shop-scale";
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
    <Application
      width={PIXELS_PER_CELL * scale}
      height={PIXELS_PER_CELL * scale}
      backgroundAlpha={0}
      antialias={true}
      className="rounded bg-zinc-700 p-0.5"
    >
      <pixiContainer
        y={(PIXELS_PER_CELL / 2) * scale}
        x={(PIXELS_PER_CELL / 2) * scale}
        scale={scale}
      >
        {children}
      </pixiContainer>
    </Application>
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
  placeholder?: boolean;
  isValid?: boolean;
  tooltip?: string;
}> = ({ material, size = "medium", quantity, placeholder = false, isValid = true, tooltip }) => {
  switch (material.type) {
    // Make the board with SVG so we don't have to use Pixi to render it
    case "board": {
      const board = material;
      const width = board.width * PIXELS_PER_INCH;
      const height = board.length * 12 * PIXELS_PER_INCH;
      const depth = (board.thickness * PIXELS_PER_INCH) / 4;

      return (
        <Wrapper size={size} quantity={quantity} isValid={isValid} tooltip={tooltip} placeholder={placeholder}>
          <svg
            viewBox={`0 0 ${PIXELS_PER_CELL} ${PIXELS_PER_CELL}`}
            className="w-full"
          >
            <rect
              x={PIXELS_PER_CELL / 2 - width / 2}
              y={PIXELS_PER_CELL / 2 - height / 2}
              width={width}
              height={height}
              fill={colorBySpecies[board.species].primary}
            />
            <rect
              x={PIXELS_PER_CELL / 2 + width / 2}
              y={PIXELS_PER_CELL / 2 - height / 2}
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
        <Wrapper size={size} isValid={isValid} tooltip={tooltip} placeholder={placeholder}>
          <svg
            viewBox={`0 0 ${PIXELS_PER_CELL} ${PIXELS_PER_CELL}`}
            className="w-full"
          >
            <rect
              x={PIXELS_PER_CELL / 2 - width / 2}
              y={PIXELS_PER_CELL / 2 - height / 2}
              width={width}
              height={height}
              fill={colorBySheetGoodKind[board.kind].primary}
            />
            <rect
              x={PIXELS_PER_CELL / 2 + width / 2 - depth}
              y={PIXELS_PER_CELL / 2 - height / 2}
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
        <Wrapper size={size} isValid={isValid} tooltip={tooltip} placeholder={placeholder}>
          <img src="/images/pallet.png" />
        </Wrapper>
      );

    default:
      return (
        <Wrapper size={size} isValid={isValid} tooltip={tooltip} placeholder={placeholder}>
          <SimpleSpriteStage scale={sizeToScale[size]}>
            <MaterialSprite material={material} />
          </SimpleSpriteStage>
        </Wrapper>
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
  isValid?: boolean;
  tooltip?: string;
  placeholder?: boolean;
}> = ({ children, size, quantity, isValid = true, tooltip, placeholder = false }) => {
  // Determine border style based on state
  const borderStyle = placeholder
    ? "border-2 border-dashed border-zinc-600"
    : isValid
      ? "border border-zinc-600"
      : "border-2 border-red-500";

  const bgStyle = placeholder
    ? "bg-zinc-800/50"
    : isValid
      ? "bg-zinc-700"
      : "bg-red-900/20";

  return (
    <span
      className={classNames(
        "rounded inline-block overflow-hidden relative",
        sizeToClassname[size],
        borderStyle,
        bgStyle,
        placeholder ? "opacity-50" : ""
      )}
      title={tooltip}
    >
      {children}
      {quantity && (
        <span className="absolute bottom-0.5 right-0.5 text-xs select-none bg-black/70 px-1 rounded">
          {quantity}
        </span>
      )}
      {/* Validation indicator for invalid materials */}
      {!isValid && !placeholder && (
        <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full" />
      )}
    </span>
  );
};
