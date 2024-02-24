import React from "react";
import { useUiMode } from "./UiMode";

export const NavBar: React.FC = () => {
  const { mode, setMode } = useUiMode();
  return (
    <nav className="flex gap-2 p-2 rounded bg-white/10 w-fit">
      <button
        className={mode.mode === "normal" ? "button" : "button-ghost"}
        onClick={() => setMode({ mode: "normal" })}
      >
        Home
      </button>
      <button
        className={mode.mode === "store" ? "button" : "button-ghost"}
        onClick={() => setMode({ mode: "store" })}
      >
        Store
      </button>
      <button
        className={mode.mode === "shopLayout" ? "button" : "button-ghost"}
        onClick={() => setMode({ mode: "shopLayout" })}
      >
        Shop Layout
      </button>
    </nav>
  );
};
