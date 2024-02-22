import React from "react";
import { useGameActions } from "./useGameActions";
import { useKeyDown } from "./useKeyDown";

export const GlobalKeyboardShortcuts: React.FC = () => {
  const { movePlayer } = useGameActions();
  useKeyDown((event) => {
    switch (event.code) {
      case "Escape":
        console.log("Escape key pressed");
        break;
      case "KeyD":
      case "ArrowRight":
        movePlayer(0);
        break;
      case "KeyW":
      case "ArrowUp":
        movePlayer(1);
        break;
      case "KeyA":
      case "ArrowLeft":
        movePlayer(2);
        break;
      case "KeyS":
      case "ArrowDown":
        movePlayer(3);
        break;
    }
  });
  return null;
};
