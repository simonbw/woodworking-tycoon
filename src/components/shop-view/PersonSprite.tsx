import { Container, Sprite } from "@pixi/react-animated";
import React from "react";
import { Spring } from "react-spring";
import { Person } from "../../game/Person";
import { directionToAngle } from "../../game/Vectors";
import { useNormalizedAngle } from "../../utils/useNormalizedAngle";
import { MaterialSprite } from "../material-sprites/MaterialSprite";
import { CELL_SIZE, cellCenter } from "./shop-scale";

export const PersonSprite: React.FC<{ person: Person }> = ({ person }) => {
  const position = cellCenter(person.position);
  const angle = useNormalizedAngle(directionToAngle(person.direction) + 90);

  return (
    <Spring
      to={{
        x: position[0],
        y: position[1],
        angle,
      }}
      config={{
        mass: 0.1,
        tension: 150,
        friction: 12,
        clamp: true,
      }}
    >
      {({ x, y, angle }) => {
        return (
          <Container x={x} y={y} angle={angle}>
            <Sprite
              image={"/images/person.png"}
              width={CELL_SIZE}
              height={CELL_SIZE}
              anchor={{ x: 0.5, y: 0.5 }}
            />
            {person.inventory.map((material, index) => (
              <Container angle={index * 10} key={index}>
                <MaterialSprite material={material} key={index} />
              </Container>
            ))}
          </Container>
        );
      }}
    </Spring>
  );
};
