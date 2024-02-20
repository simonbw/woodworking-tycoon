import React, { ReactNode, createContext, useContext, useState } from "react";
import { MachineType } from "../game/MachineType";

export type UiMode =
  | { mode: "normal" }
  | { mode: "addingMachine"; machine: MachineType };
const uiModeContext = createContext<
  { mode: UiMode; setMode: (mode: UiMode) => void } | undefined
>(undefined);

export const UiModeProvider: React.FC<{ children?: ReactNode }> = ({
  children,
}) => {
  const [mode, setMode] = useState<UiMode>({ mode: "normal" });

  return (
    <uiModeContext.Provider value={{ mode, setMode }}>
      {children}
    </uiModeContext.Provider>
  );
};

export const useUiMode = () => {
  const context = useContext(uiModeContext);
  if (!context) {
    throw new Error("useUiMode must be used within a UiModeProvider");
  }
  return context;
};
