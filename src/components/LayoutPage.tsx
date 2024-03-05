import { Container, Stage } from "@pixi/react";
import React, { useState } from "react";
import { useCellMap } from "../game/CellMap";
import { MachineType } from "../game/Machine";
import { groupBy } from "../utils/arrayUtils";
import { NavBar } from "./NavBar";
import { FloorTileSprite } from "./shop-view/FloorTileSprite";
import { MachineSprite } from "./shop-view/MachineSprite";
import { MaterialPilesSprite } from "./shop-view/MaterialPileSprite";
import { PIXELS_PER_CELL, cellToPixel } from "./shop-view/shop-scale";
import {
  gameStateContext,
  useApplyGameAction,
  useGameState,
} from "./useGameState";
import { useKeyDown } from "./useKeyDown";

export const LayoutPage: React.FC = () => {
  const [selectedMachine, setSelectedMachine] = useState<MachineType | null>(
    null
  );
  useKeyDown((event) => {
    switch (event.key) {
      case "Escape":
        return setSelectedMachine(null);
    }
  });

  const gameState = useGameState();
  const updateGameState = useApplyGameAction();
  const cellMap = useCellMap();

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
          <Stage
            width={width}
            height={height}
            options={{ backgroundAlpha: 0, antialias: true, eventMode: "auto" }}
          >
            <gameStateContext.Provider value={{ gameState, updateGameState }}>
              {cellMap.getCells().map((cell) => (
                <FloorTileSprite
                  cell={cell}
                  key={`cell-${cell.position.join(",")}`}
                />
              ))}
              {materialPileGroups.map((materialPiles, i) => (
                <Container
                  key={`pile${materialPiles[0].position.join(",")}`}
                  x={materialPiles[0].position[0] * PIXELS_PER_CELL}
                  y={materialPiles[0].position[1] * PIXELS_PER_CELL}
                >
                  <MaterialPilesSprite materialPiles={materialPiles} />
                </Container>
              ))}
              {gameState.machines.map((machinePlacement) => (
                <MachineSprite
                  key={
                    machinePlacement.type.id +
                    machinePlacement.position.join(",")
                  }
                  machine={machinePlacement}
                />
              ))}
            </gameStateContext.Provider>
          </Stage>
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
    ...groupBy(gameState.storage.machines, (machine) => machine.id).values(),
  ];
  return (
    <section>
      <h2 className="section-heading">Storage</h2>
      <ul>
        {groupedMachines.map((machines) => (
          <li key={machines[0].id}>
            <span>{machines[0].name}</span>
            <button
              className="button"
              onClick={() => setSelectedMachine(machines[0])}
            >
              Place
            </button>
            {machines.length > 1 && <span>x{machines.length}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
};
