import { useRef } from "react";
import { angleDelta } from "./mathUtils";

export function useNormalizedAngle(rawAngle: number) {
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
