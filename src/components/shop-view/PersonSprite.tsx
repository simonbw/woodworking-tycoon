import { Sprite } from "@pixi/react-animated";
import React from "react";
import { Spring } from "react-spring";
import { Person } from "../../game/Person";
import { directionToAngle, scaleVec, translateVec } from "../../game/Vectors";
import { CELL_SIZE } from "./ShopView";

export const PersonSprite: React.FC<{ person: Person }> = ({ person }) => {
  const position = translateVec(scaleVec(person.position, CELL_SIZE), [50, 50]);
  return (
    <Spring
      to={{
        x: position[0],
        y: position[1],
        angle: directionToAngle(person.direction) + 90, // TODO: Angle
      }}
      config={{
        mass: 0.1,
        tension: 200,
        friction: 12,
        clamp: true,
      }}
    >
      {({ x, y, angle }) => {
        return (
          <Sprite
            image={"/images/person.png"}
            x={x}
            y={y}
            angle={angle}
            width={100}
            height={100}
            anchor={{ x: 0.5, y: 0.5 }}
          />
        );
      }}
    </Spring>
  );
};
