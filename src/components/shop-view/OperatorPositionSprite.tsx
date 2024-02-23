import React, { useId } from "react";
import { Vector } from "../../game/Vectors";
import { scaled } from "./ShopView";

export const OperatorPositionSprite: React.FC<{ position: Vector }> = ({
  position: [x, y],
}) => {
  const gradientId = useId();
  return (
    <>
      <defs>
        <radialGradient id={gradientId}>
          <stop offset="0%" className="stop-sky-400/20" />
          <stop offset="75%" className="stop-sky-400/60" />
          <stop offset="80%" className="stop-sky-400/20" />
          <stop offset="100%" className="stop-sky-400/0" />
        </radialGradient>
      </defs>
      <circle
        cx={50}
        cy={50}
        r={50}
        fill={`url(#${gradientId})`}
        className="opacity-0"
        style={{ transform: `translate(${scaled(x)}px, ${scaled(y)}px)` }}
      />
    </>
  );
};
