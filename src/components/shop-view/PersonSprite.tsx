import { Sprite } from "@pixi/react-animated";
import React, { useEffect, useRef } from "react";
import { Spring } from "react-spring";
import { Person } from "../../game/Person";
import { directionToAngle, scaleVec, translateVec } from "../../game/Vectors";
import { CELL_SIZE } from "./ShopView";
import { angleDelta } from "../../utils/mathUtils";

function useNormalizedAngle(rawAngle: number) {
  const lastRawAngle = useRef<number>(rawAngle);
  const normalizedAngle = useRef<number>(rawAngle);

  // Whenever we get a new angle
  if (lastRawAngle.current !== rawAngle) {
    const angleDiff = angleDelta(normalizedAngle.current, rawAngle);
    lastRawAngle.current = rawAngle;

    if (angleDiff > 180) {
      normalizedAngle.current -= 360;
    } else if (angleDiff < -180) {
      normalizedAngle.current += 360;
    }

    normalizedAngle.current += angleDiff;
  }

  return normalizedAngle.current;
}

export const PersonSprite: React.FC<{ person: Person }> = ({ person }) => {
  const position = translateVec(scaleVec(person.position, CELL_SIZE), [50, 50]);

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
