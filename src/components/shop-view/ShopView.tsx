import { Application } from "@pixi/react";
import React, { useLayoutEffect, useRef, useState } from "react";
import { useCellMap } from "../../game/CellMap";
import { useTexture } from "../../utils/useTexture";
import {
  gameStateContext,
  useApplyGameAction,
  useGameState,
  useMachines,
  useQuitToMenu,
  useSaveGame,
} from "../useGameState";
import { useModalOpen } from "../shortcuts/ShortcutProvider";
import { TICK_SPEED_PAUSED, useTickSpeed } from "../TickSpeedContext";
import { BroomSprite } from "./BroomSprite";
import { CarriedMachineLayer } from "./CarriedMachineLayer";
import {
  CollisionDebugLayer,
  collisionDebugRequested,
} from "./CollisionDebugLayer";
import { DustLayer } from "./DustLayer";
import { EntranceSprite } from "./EntranceSprite";
import { FloorTileSprite } from "./FloorTileSprite";
import { HeldMovementListener } from "./heldMovementInput";
import { MachineCrateSprite } from "./MachineCrateSprite";
import { MachineSprite } from "./MachineSprite";
import { useTargetedMachine } from "../TargetedMachineContext";
import { ShopOverlayLayer } from "../shop-overlay/ShopOverlayLayer";
import { MaterialPilesSprite } from "./MaterialPileSprite";
import { PersonSprite } from "./PersonSprite";
import { PlayerMotionLayer } from "./PlayerMotionLayer";
import { ShopKeyboardShortcuts } from "./ShopKeyboardShortcuts";
import { ShopVacSprite } from "./ShopVacSprite";
import { cellToPixel, cellToPixelVec } from "./shop-scale";

export const ShopView: React.FC = () => {
  const gameState = useGameState();
  const machines = useMachines();
  const updateGameState = useApplyGameAction();
  const saveGame = useSaveGame();
  const quitToMenu = useQuitToMenu();
  const cellMap = useCellMap();
  const floorTexture = useTexture("/images/concrete-floor-2-big.png");
  const modalOpen = useModalOpen();
  const { ticksPerSecond } = useTickSpeed();
  const {
    machines: operableHere,
    isTargeted,
    setTarget,
    toggleSheet,
  } = useTargetedMachine();

  // Clicking a machine you're standing at aims the keyboard at it; a
  // second click on a recipe-driven station spreads its sheet open. The
  // mouse can't reach machines you're not at — walk over first.
  const machineClickHandler = (machine: (typeof machines)[number]) => {
    const reachable = operableHere.some(
      (candidate) =>
        candidate.type.name === machine.type.name &&
        candidate.position.join(",") === machine.position.join(","),
    );
    if (!reachable) return undefined;
    return () => {
      if (!isTargeted(machine)) {
        setTarget(machine);
      } else {
        toggleSheet();
      }
    };
  };

  const materialPileGroups = cellMap
    .getCells()
    .filter((cell) => cell.materialPiles.length > 0)
    .map((cell) => cell.materialPiles);

  const width = cellToPixel(cellMap.getWidth());
  const height = cellToPixel(cellMap.getHeight());

  // The shop is the screen: the canvas scales to fill whatever space the
  // rails leave it. The renderer runs at the scaled resolution with the
  // world drawn through one scaled root container, so the (2×-resolution)
  // sprite art gains real detail instead of being CSS-stretched.
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => {
      const rect = container.getBoundingClientRect();
      const fit = Math.min(rect.width / width, rect.height / height);
      // Quantized so ordinary layout jitter doesn't rebuild the renderer
      setScale(Math.min(2, Math.max(0.5, Math.floor(fit * 20) / 20)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [width, height]);

  const scaledWidth = Math.round(width * scale);
  const scaledHeight = Math.round(height * scale);

  return (
    <div
      ref={containerRef}
      className="h-full w-full min-h-0 min-w-0 flex items-center justify-center"
    >
      <div
        className="relative"
        style={{ width: scaledWidth, height: scaledHeight }}
      >
        <ShopKeyboardShortcuts />
        <HeldMovementListener enabled={!gameState.player.away && !modalOpen} />
        <Application
          width={scaledWidth}
          height={scaledHeight}
          backgroundAlpha={0}
          antialias={true}
        >
          <gameStateContext.Provider
            value={{ gameState, updateGameState, saveGame, quitToMenu }}
          >
            <pixiContainer scale={scale}>
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
          <EntranceSprite />
          {/* Settled sawdust sits on the floor, under everything that moves */}
          <DustLayer width={width} height={height} />
          {gameState.progression.sweepingUnlocked && <BroomSprite />}

          {gameState.machineCrates.map((crate, index) => (
            <MachineCrateSprite
              crate={crate}
              key={`crate-${index}-${crate.position.join(",")}`}
            />
          ))}

          {materialPileGroups.map((materialPiles, i) => {
            const [x, y] = cellToPixelVec(materialPiles[0].position);
            return (
              <pixiContainer
                key={`pile${materialPiles[0].position.join(",")}`}
                x={x}
                y={y}
              >
                <MaterialPilesSprite materialPiles={materialPiles} />
              </pixiContainer>
            );
          })}
          {[...machines]
            // Worktables draw first so mounted benchtop machines sit on top
            .sort(
              (a, b) =>
                Number(b.type.worktable ?? false) -
                Number(a.type.worktable ?? false),
            )
            .map((machinePlacement) => (
              <MachineSprite
                key={
                  machinePlacement.type.id + machinePlacement.position.join(",")
                }
                machine={machinePlacement}
                isSelected={
                  !gameState.player.away &&
                  gameState.player.carriedMachine == null &&
                  isTargeted(machinePlacement)
                }
                onClick={machineClickHandler(machinePlacement)}
              />
            ))}
          {collisionDebugRequested() && <CollisionDebugLayer />}
            <PlayerMotionLayer paused={ticksPerSecond === TICK_SPEED_PAUSED} />
            <ShopVacSprite />
            {!gameState.player.away && (
              <PersonSprite person={gameState.player} />
            )}
            <CarriedMachineLayer />
            </pixiContainer>
          </gameStateContext.Provider>
        </Application>
        {/* Everything you can do, shown at the thing you'd do it to */}
        <ShopOverlayLayer
          width={scaledWidth}
          height={scaledHeight}
          scale={scale}
        />
      </div>
    </div>
  );
};
