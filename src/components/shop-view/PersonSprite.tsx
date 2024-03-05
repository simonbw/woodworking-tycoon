import { Container, Sprite } from "@pixi/react-animated";
import React from "react";
import { Spring } from "react-spring";
import { Person } from "../../game/Person";
import { directionToAngle } from "../../game/Vectors";
import { useNormalizedAngle } from "../../utils/useNormalizedAngle";
import { MaterialSprite } from "../material-sprites/MaterialSprite";
import { cellToPixelCenter, inchesToPixels } from "./shop-scale";

const personSize = inchesToPixels(32);

export const PersonSprite: React.FC<{ person: Person }> = ({ person }) => {
  const position = cellToPixelCenter(person.position);
  const angle = useNormalizedAngle(directionToAngle(person.direction) + 90);

  return (
    <Spring
      to={{ position, angle }}
      config={{
        mass: 0.1,
        tension: 150,
        friction: 12,
        clamp: true,
      }}
    >
      {({ angle, position }) => {
        return (
          <Container position={position} angle={angle}>
            {person.inventory.map((material, index) => (
              <Container angle={index * 1} x={inchesToPixels(6)} key={index}>
                <MaterialSprite material={material} key={index} />
              </Container>
            ))}
            <Sprite
              image={"/images/person.png"}
              width={personSize}
              height={personSize}
              anchor={{ x: 0.5, y: 0.5 }}
            />
          </Container>
        );
      }}
    </Spring>
  );
};
