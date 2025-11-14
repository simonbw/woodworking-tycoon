import React from "react";
import { animated, useSpring } from "react-spring";
import { Person } from "../../game/Person";
import { directionToAngle } from "../../game/Vectors";
import { useNormalizedAngle } from "../../utils/useNormalizedAngle";
import { useTexture } from "../../utils/useTexture";
import { MaterialSprite } from "../material-sprites/MaterialSprite";
import { cellToPixelCenter, inchesToPixels } from "./shop-scale";

const personSize = inchesToPixels(32);

const AnimatedPixiContainer = animated("pixiContainer");

export const PersonSprite: React.FC<{ person: Person }> = ({ person }) => {
  const personTexture = useTexture("/images/person.png");
  const position = cellToPixelCenter(person.position);
  const angle = useNormalizedAngle(directionToAngle(person.direction) + 90);

  const springProps = useSpring({
    to: {
      x: position[0],
      y: position[1],
      angle
    },
    config: {
      mass: 0.1,
      tension: 150,
      friction: 12,
      clamp: true,
    },
  });

  return (
    <AnimatedPixiContainer x={springProps.x} y={springProps.y} angle={springProps.angle}>
      {person.inventory.map((material, index) => (
        <pixiContainer angle={index * 1} x={inchesToPixels(6)} key={index}>
          <MaterialSprite material={material} key={index} />
        </pixiContainer>
      ))}
      <pixiSprite
        texture={personTexture}
        width={personSize}
        height={personSize}
        anchor={{ x: 0.5, y: 0.5 }}
      />
    </AnimatedPixiContainer>
  );
};
