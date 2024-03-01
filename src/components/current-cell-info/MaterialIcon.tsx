import { Container, Stage } from "@pixi/react";
import React, { ReactNode } from "react";
import { MaterialInstance } from "../../game/Materials";
import { MaterialSprite } from "../shop-view/MaterialPileSprite";

export const SimpleSpriteStage: React.FC<{
  children: ReactNode;
  scale?: number;
}> = ({ children, scale = 0.5 }) => {
  return (
    <Stage
      width={100 * scale}
      height={100 * scale}
      raf={false}
      options={{
        backgroundAlpha: 0,
        antialias: true,
      }}
      className="rounded bg-zinc-700 p-0.5"
    >
      <Container x={50 * scale} y={50 * scale} scale={scale}>
        {children}
      </Container>
    </Stage>
  );
};

// TODO: Optimize this a lot
export const MaterialIcon: React.FC<{ material: MaterialInstance }> = ({
  material,
}) => {
  return (
    <SimpleSpriteStage>
      <MaterialSprite material={material} />
    </SimpleSpriteStage>
  );
};
