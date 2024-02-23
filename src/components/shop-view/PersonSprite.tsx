import React from "react";
import { Person } from "../../game/Person";
import { scaled } from "./ShopView";

export const PersonSprite: React.FC<{ person: Person }> = ({ person }) => {
  const [x, y] = person.position;
  return (
    <circle
      cx={50}
      cy={50}
      r={30}
      className="transition-transform ease-out fill-sky-500 drop-shadow-md"
      style={{ transform: `translate(${scaled(x)}px, ${scaled(y)}px)` }}
    />
  );
};
