import { useTick } from "@pixi/react";
import { Container } from "pixi.js";
import React, { useRef } from "react";

/**
 * Buzzes its children with a tiny random jitter while `active` — the
 * universal body language of a power tool that's running. Positions are
 * poked imperatively each frame so React never re-renders for it.
 */
export const Vibrating: React.FC<{
  active: boolean;
  amplitude?: number;
  children: React.ReactNode;
}> = ({ active, amplitude = 0.6, children }) => {
  const ref = useRef<Container>(null);

  useTick(() => {
    const container = ref.current;
    if (!container) return;
    if (active) {
      container.x = (Math.random() * 2 - 1) * amplitude;
      container.y = (Math.random() * 2 - 1) * amplitude;
    } else {
      container.x = 0;
      container.y = 0;
    }
  });

  return <pixiContainer ref={ref}>{children}</pixiContainer>;
};
