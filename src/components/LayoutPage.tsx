import { Application } from "@pixi/react";
import React, { useState } from "react";
import { useCellMap } from "../game/CellMap";
import { MACHINE_TYPES, MachineId, MachineType } from "../game/Machine";
import { groupBy } from "../utils/arrayUtils";
import { useTexture } from "../utils/useTexture";
import { NavBar } from "./NavBar";
import { FloorTileSprite } from "./shop-view/FloorTileSprite";
import { MachineSprite } from "./shop-view/MachineSprite";
import { MaterialPilesSprite } from "./shop-view/MaterialPileSprite";
import { PIXELS_PER_CELL, cellToPixel } from "./shop-view/shop-scale";
import {
  gameStateContext,
  useApplyGameAction,
  useGameState,
  useMachines,
  useSaveGame,
  useLoadGame,
  useNewGame,
} from "./useGameState";
import { useKeyDown } from "./useKeyDown";

export const LayoutPage: React.FC = () => {
  const [selectedMachine, setSelectedMachine] = useState<MachineType | null>(
    null,
  );
  useKeyDown((event) => {
    switch (event.key) {
      case "Escape":
        return setSelectedMachine(null);
    }
  });

  const gameState = useGameState();
  const machines = useMachines();
  const updateGameState = useApplyGameAction();
  const saveGame = useSaveGame();
  const loadGame = useLoadGame();
  const newGame = useNewGame();
  const cellMap = useCellMap();
  const floorTexture = useTexture("/images/concrete-floor-2-big.png");

  const materialPileGroups = cellMap
    .getCells()
    .filter((cell) => cell.materialPiles.length > 0)
    .map((cell) => cell.materialPiles);

  const width = cellToPixel(cellMap.getWidth());
  const height = cellToPixel(cellMap.getHeight());

  return (
    <main className="p-8 space-y-6">
      <NavBar />

      <div className="grid grid-cols-2">
        <section>
          <Application
            width={width}
            height={height}
            backgroundAlpha={0}
            antialias={true}
          >
            <gameStateContext.Provider
              value={{
                gameState,
                updateGameState,
                saveGame,
                loadGame,
                newGame,
              }}
            >
              <pixiTilingSprite
                eventMode="static"
                texture={floorTexture}
                tilePosition={{ x: 0, y: 0 }}
                tileScale={{ x: 0.25, y: 0.25 }}
                width={width}
                height={height}
              />
              {cellMap.getCells().map((cell) => (
                <FloorTileSprite
                  cell={cell}
                  key={`cell-${cell.position.join(",")}`}
                />
              ))}
              {materialPileGroups.map((materialPiles, i) => (
                <pixiContainer
                  key={`pile${materialPiles[0].position.join(",")}`}
                  x={materialPiles[0].position[0] * PIXELS_PER_CELL}
                  y={materialPiles[0].position[1] * PIXELS_PER_CELL}
                >
                  <MaterialPilesSprite materialPiles={materialPiles} />
                </pixiContainer>
              ))}
              {machines.map((machinePlacement) => (
                <MachineSprite
                  key={
                    machinePlacement.type.id +
                    machinePlacement.position.join(",")
                  }
                  machine={machinePlacement}
                />
              ))}
            </gameStateContext.Provider>
          </Application>
        </section>
        <StorageSection
          selectedMachine={selectedMachine}
          setSelectedMachine={setSelectedMachine}
        />
      </div>
    </main>
  );
};

const StorageSection: React.FC<{
  selectedMachine: MachineType | null;
  setSelectedMachine: (machineType: MachineType | null) => void;
}> = ({ setSelectedMachine }) => {
  const gameState = useGameState();
  const groupedMachines = [
    ...groupBy(gameState.storage.machines, (machineId) => machineId).values(),
  ];
  return (
    <section>
      <h2 className="section-heading">Storage</h2>
      <ul>
        {groupedMachines.map((machineIds) => {
          const machineType = MACHINE_TYPES[machineIds[0]];
          return (
            <li key={machineIds[0]}>
              <span>{machineType.name}</span>
              <button
                className="button"
                onClick={() => setSelectedMachine(machineType)}
              >
                Place
              </button>
              {machineIds.length > 1 && <span>x{machineIds.length}</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
};
