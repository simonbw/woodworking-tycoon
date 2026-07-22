import { useTick } from "@pixi/react";
import { Container, Ticker } from "pixi.js";
import React, { useRef } from "react";
import { Person } from "../../game/Person";
import { useTexture } from "../../utils/useTexture";
import { MaterialSprite } from "../material-sprites/MaterialSprite";
import { playerMotion } from "./playerMotionStore";
import { cellToPixel, inchesToPixels } from "./shop-scale";

const personSize = inchesToPixels(32);

/** How quickly the sprite eases around to a new heading, per second. */
const TURN_RATE = 12;

/**
 * The player's body. Position and facing come from the continuous motion
 * store (written by PlayerMotionLayer), poked onto the container each
 * frame in useTick — walking never re-renders React. Only the inventory
 * in their arms renders through React, since it changes on game actions.
 */
export const PersonSprite: React.FC<{ person: Person }> = ({ person }) => {
  const personTexture = useTexture("/images/person.png");
  const containerRef = useRef<Container>(null);

  useTick((ticker: Ticker) => {
    const container = containerRef.current;
    if (!container) return;
    container.x = cellToPixel(playerMotion.pos[0]);
    container.y = cellToPixel(playerMotion.pos[1]);

    // Ease the sprite around the shortest arc toward the motion heading.
    // The texture faces up, so facing +x means a quarter turn clockwise.
    const target = playerMotion.heading + Math.PI / 2;
    const delta =
      ((target - container.rotation + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const dt = ticker.deltaMS / 1000;
    container.rotation += delta * Math.min(1, dt * TURN_RATE);
  });

  return (
    <pixiContainer
      ref={containerRef}
      x={cellToPixel(playerMotion.pos[0])}
      y={cellToPixel(playerMotion.pos[1])}
    >
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
    </pixiContainer>
  );
};
