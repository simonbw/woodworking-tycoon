import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import { Machine } from "../../game/Machine";
import { PIXELS_PER_CELL, cellToPixelCenter } from "./shop-scale";

/**
 * What the cursor hits when it points at a machine: one invisible shape
 * per machine, covering the cells it claims.
 *
 * Separate from the art for two reasons. A container of texture sprites
 * has no geometry to hit-test against, so the art can't answer the mouse
 * on its own. And this layer draws *under* the floor's loose stock, which
 * decides priority: a board lying across a machine's footprint is what
 * you're pointing at, not the machine beneath it.
 *
 * Only machines the body can already reach get a shape. The cursor
 * chooses among what's in reach — it never extends it.
 */
export const MachineHitTargets: React.FC<{
  machines: readonly Machine[];
  onHover: (machine: Machine) => void;
  onClick: (machine: Machine) => void;
  onRightClick: (machine: Machine) => void;
}> = ({ machines, onHover, onClick, onRightClick }) => (
  <>
    {machines.map((machine, index) => (
      <MachineHitTarget
        key={`hit-${index}`}
        machine={machine}
        onHover={() => onHover(machine)}
        onClick={() => onClick(machine)}
        onRightClick={() => onRightClick(machine)}
      />
    ))}
  </>
);

const MachineHitTarget: React.FC<{
  machine: Machine;
  onHover: () => void;
  onClick: () => void;
  onRightClick: () => void;
}> = ({ machine, onHover, onClick, onRightClick }) => {
  const [x, y] = cellToPixelCenter(machine.position);
  const cells = machine.type.cellsOccupied;

  // Local, unrotated coordinates — the container carries the angle, the
  // same way the art does.
  const draw = useCallback(
    (g: Graphics) => {
      g.clear();
      const xs = cells.map(([cx]) => cx);
      const ys = cells.map(([, cy]) => cy);
      const left = (Math.min(...xs) - 0.5) * PIXELS_PER_CELL;
      const top = (Math.min(...ys) - 0.5) * PIXELS_PER_CELL;
      g.rect(
        left,
        top,
        (Math.max(...xs) + 0.5) * PIXELS_PER_CELL - left,
        (Math.max(...ys) + 0.5) * PIXELS_PER_CELL - top,
      );
      g.fill({ color: 0xffffff, alpha: 0 });
    },
    [cells],
  );

  return (
    <pixiContainer x={x} y={y} angle={machine.rotation * -90}>
      <pixiGraphics
        draw={draw}
        eventMode="static"
        cursor="pointer"
        onClick={onClick}
        onPointerOver={onHover}
        onRightClick={onRightClick}
      />
    </pixiContainer>
  );
};
