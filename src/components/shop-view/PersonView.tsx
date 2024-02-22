import React from "react";
import { Person } from "../../game/Person";

export const PersonView: React.FC<{ person: Person }> = ({ person }) => {
  const [x, y] = person.position;
  return (
    <>
      <circle
        cx={0.5}
        cy={0.5}
        r={0.3}
        className="transition-transform ease-out fill-sky-500 drop-shadow-[0_5px_5px_rgba(0,0,0,1)]"
        style={{ transform: `translate(${x}px, ${y}px)` }}
      />
    </>
  );
};
