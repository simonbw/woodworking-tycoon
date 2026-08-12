import type { Container, RenderLayer } from "pixi.js";
import React, { useRef, useState } from "react";
import { useCellMap } from "../useCellMap";
import { MachineId, machineKey } from "../../game/Machine";
import { tutorialTargets } from "../tutorial/tutorialTargets";
import { vectorKey } from "../../game/Vectors";
import { useTexture } from "../../utils/useTexture";
import { useApplyGameAction, useGameState, useMachines } from "../useGameState";
import {
  SceneView,
  WorldOverlayBox,
  WorldScene,
} from "../world-view/WorldScene";
import { useModalOpen } from "../shortcuts/ShortcutProvider";
import {
  setOperatingAction,
  setWaitingAction,
  setSweepAimAction,
} from "../../game/game-actions/player-actions";
import { SWEEP_AIM_REACH } from "../../game/game-actions/dust-actions";
import { holdingBroom } from "../../game/HeldTool";
import { resolveInteract } from "../../game/interact";
import { clamp } from "../../utils/mathUtils";
import { usePaused } from "../PauseContext";
import { BroomSprite } from "./BroomSprite";
import { CarriedMachineLayer } from "./CarriedMachineLayer";
import {
  CollisionDebugLayer,
  collisionDebugRequested,
} from "./CollisionDebugLayer";
import { cutSprayLayerContext } from "./cutSprayLayer";
import { DustLayer } from "./DustLayer";
import { DustMotionLayer } from "./DustMotionLayer";
import { FeedLaneLayer } from "./FeedLaneLayer";
import { FloorTileSprite } from "./FloorTileSprite";
import { HeldMovementListener } from "../world-view/heldMovementInput";
import { HeldKeyListener } from "./heldOperateInput";
import { MachineCrateSprite } from "./MachineCrateSprite";
import { MachineSprite } from "./MachineSprite";
import { MachineHitTargets } from "./MachineHitTargets";
import { useTargetedMachine } from "../TargetedMachineContext";
import { sheetIsBenchView } from "../station/StationSheet";
import { ShopOverlayLayer } from "../shop-overlay/ShopOverlayLayer";
import { MaterialPileSprite } from "./MaterialPileSprite";
import { PersonSprite } from "./PersonSprite";
import { FootstepSoundLayer } from "./FootstepSoundLayer";
import { PlayerMotionLayer } from "./PlayerMotionLayer";
import { PowerCordLayer } from "./PowerCordLayer";
import { ShopKeyboardShortcuts } from "./ShopKeyboardShortcuts";
import { ShopVacSprite } from "./ShopVacSprite";
import { DaylightLayer } from "./DaylightLayer";
import { EnvironmentLayer } from "./EnvironmentLayer";
import { CameraLayer } from "./CameraLayer";
import { camera } from "./cameraStore";
import { BenchDiveLayer } from "./BenchDiveLayer";
import { useBenchDiveActive } from "../bench-view/benchSceneSlot";
import { useTruckStage } from "./truckStageStore";
import { atTruckBed } from "../../game/lot";
import { atStand, isSellable, sidewalkY } from "../../game/stand";
import { isNight } from "../../game/time-flow";
import { TruckHighlight } from "./TruckSprite";
import { PIXELS_PER_CELL, cellToPixel, cellToPixelCenter } from "./shop-scale";
import { WorktableShadowSprite } from "../machine-sprites/WorktableSprite";

/**
 * Grass and driveway kept visible around the building when fitting the
 * camera, in world pixels — the apron is what makes the shop read as a
 * building on a lot instead of a floor grid pinned to the viewport.
 */
const LOT_APRON = PIXELS_PER_CELL * 3;

/**
 * The shop and its lot: everything drawn on the game's one screen, and
 * the keys that reach it.
 *
 * The canvas itself — measuring, fitting, the renderer, the DOM overlay's
 * box — is `WorldScene`, which knows nothing about shops. What's here is
 * the shop's own: its layers in their draw order, its camera, the bench
 * dive, and the broom's pointer aim.
 */
export const ShopView: React.FC = () => {
  const gameState = useGameState();
  const machines = useMachines();
  const updateGameState = useApplyGameAction();
  const cellMap = useCellMap();
  const floorTexture = useTexture("/images/concrete-floor-2-big.png");
  const modalOpen = useModalOpen();
  const { paused } = usePaused();
  // While the truck is rolling in, the player is still in it: input
  // holds and the sprite waits until the stage is parked again.
  const truckStage = useTruckStage();
  // While a bench view is mounted the camera is diving into (or back
  // out of) the bench; the floor's DOM chips fade so they don't hang
  // untransformed over a swelling world.
  const benchDive = useBenchDiveActive();
  const {
    machine: targetedMachine,
    machines: operableHere,
    isTargeted,
    setTarget,
    toggleSheet,
    openSheet,
    sheetMachine,
    pileOffset,
    setPileTarget,
    openFloorSheet,
    truckMenuOpen,
  } = useTargetedMachine();

  // Leaning over a bench (the full-window bench view) pins the feet:
  // hands are on the work, so the body stays put until Tab steps back.
  // The small card sheets keep the walk-away-to-close behavior.
  const leaningOverBench =
    sheetMachine != null &&
    sheetIsBenchView(sheetMachine, gameState.progression);

  // The pile E is about to grab wears the shared targeting outline —
  // resolved by the same resolver the keyboard uses (with R's rummage
  // offset applied), so the highlight and the keypress can never disagree
  // about which piece leaves the floor.
  const interact = resolveInteract(gameState, targetedMachine, pileOffset);
  const pickupTarget =
    interact?.kind === "pick-up-floor" ? interact.target : undefined;

  // The truck wears the same outline as any other target, aimed at
  // whatever the keys would actually move. Lifting a piece back out is a
  // pickup like any other, so the *piece* lights up, not the truck. The
  // cargo box itself only lights when the bed is the thing being acted on
  // — F loading what's in hand over the rail, or a crate hoisting out of
  // it — and the whole body lights when E would open the cab.
  const atBed =
    !gameState.player.away &&
    truckStage === "parked" &&
    gameState.player.carriedMachine == null &&
    atTruckBed(gameState.shopInfo, gameState.player.position);
  const bedIsTheTarget =
    atBed &&
    (gameState.player.inventory.length > 0 ||
      gameState.truck.crates.length > 0);
  const truckHighlight: TruckHighlight = bedIsTheTarget
    ? "bed"
    : truckStage === "parked" && interact?.kind === "truck-cab"
      ? "truck"
      : null;
  const truckCargoHighlight =
    atBed && interact?.kind === "truck-bed" ? interact.material : undefined;

  // The stand wears the same treatment: the table lights when F would
  // set work out on it, and the piece E would take back lights on its
  // own the way a floor pile does.
  const atStandNow =
    !gameState.player.away &&
    gameState.player.carriedMachine == null &&
    atStand(gameState.shopInfo, gameState.player.position);
  const standHighlight =
    atStandNow && gameState.player.inventory.some(isSellable);
  const standItemHighlight =
    interact?.kind === "stand" ? interact.material : undefined;

  // Where the guided opening is pointing, in the world. Empty once the
  // tutorial is done, so this costs nothing for the rest of the game.
  const coach = tutorialTargets(gameState);

  // At close the corner card points home (see NightfallCard), and the
  // truck wears the same coach outline so the card and the world agree.
  const homewardNudge: TruckHighlight =
    isNight(gameState) && !gameState.player.away && truckStage === "parked"
      ? "truck"
      : null;

  // Which of the floor's pieces answer to the cursor: pointing at one aims
  // E at it (the rummage key's job, done by hand), and right-clicking
  // spreads every piece in reach out on a card. Only the pieces the
  // interact resolver is actually offering are live — out of reach, or
  // hands too full to take anything, and they're scenery.
  const reachablePiles = new Set(
    interact?.kind === "pick-up-floor"
      ? interact.piles.map((pile) => pile.material.id)
      : [],
  );

  const width = cellToPixel(cellMap.getWidth());
  const height = cellToPixel(cellMap.getHeight());

  // The camera's two hands: the world container it scrolls and the DOM
  // overlay that rides along. Imperative on purpose — see CameraLayer.
  const cameraContainerRef = useRef<Container>(null);
  const overlayScrollRef = useRef<HTMLDivElement>(null);
  // The bench dive's hand: a wrapper the whole world (camera included)
  // renders through, swelled about the bench while a bench view is
  // mounted. Imperative for the same reason — see BenchDiveLayer.
  const benchDiveContainerRef = useRef<Container>(null);
  // The layer the machines' cut spray renders through, held in state so
  // the provider re-renders the consumers once the pixi element exists —
  // see cutSprayLayer.ts for why the spray can't render in place.
  const [cutSprayLayer, setCutSprayLayer] = useState<RenderLayer | null>(null);

  // The mouse steers the broom head: while the broom is in hand, the
  // cursor's floor cell (clamped to arm's reach) becomes the sweep aim,
  // and the swath works there instead of the facing direction. Purely an
  // aim refinement — WASD alone still sweeps ahead of you. Listened for
  // on the DOM container, where the floor mapping is the scene's fit.
  const handlePointerMove = (
    event: React.PointerEvent<HTMLDivElement>,
    { scale, offsetX, offsetY }: SceneView,
  ) => {
    if (!holdingBroom(gameState)) {
      updateGameState(setSweepAimAction(null));
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const cellX = Math.floor(
      (event.clientX - rect.left - offsetX) / (scale * PIXELS_PER_CELL),
    );
    const cellY = Math.floor(
      (event.clientY - rect.top - offsetY + camera.scroll * scale) /
        (scale * PIXELS_PER_CELL),
    );
    const [px, py] = gameState.player.position;
    updateGameState(
      setSweepAimAction([
        px + clamp(cellX - px, -SWEEP_AIM_REACH, SWEEP_AIM_REACH),
        py + clamp(cellY - py, -SWEEP_AIM_REACH, SWEEP_AIM_REACH),
      ]),
    );
  };
  const clearAim = () => updateGameState(setSweepAimAction(null));

  const renderWorld = (view: SceneView) => {
    const { scale, offsetX, offsetY } = view;
    // How far the camera can follow the player down the lot, in world
    // pixels: at full scroll the viewport's bottom edge reaches past the
    // walkable world's bottom to the sidewalk line the stand's customers
    // stroll, with a little ground under their feet. Zero on a viewport
    // tall enough to see it all already — the camera then never moves.
    const seenBottomCells = sidewalkY(gameState.shopInfo) + 1.5;
    const scrollMax = Math.max(
      0,
      cellToPixel(seenBottomCells) - (view.height - offsetY) / scale,
    );
    // What the canvas can ever see, in world pixels — the lot fills all of
    // it, extended down by the camera's scroll range so the ground is
    // already drawn everywhere the camera can go.
    const worldViewport = {
      left: -offsetX / scale,
      top: -offsetY / scale,
      right: (view.width - offsetX) / scale,
      bottom: (view.height - offsetY) / scale + scrollMax,
    };

    return (
      <>
        <CameraLayer
          worldRef={cameraContainerRef}
          overlayRef={overlayScrollRef}
          scrollStartY={cellMap.getHeight()}
          scrollMax={scrollMax}
          offsetY={offsetY}
          viewHeight={view.height}
          scale={scale}
        />
        <cutSprayLayerContext.Provider value={cutSprayLayer}>
          <pixiContainer x={offsetX} y={offsetY} scale={scale}>
            <pixiContainer ref={benchDiveContainerRef}>
              <pixiContainer ref={cameraContainerRef}>
                <EnvironmentLayer
                  width={width}
                  height={height}
                  viewport={worldViewport}
                  truckHighlight={truckHighlight}
                  truckCargoHighlight={truckCargoHighlight}
                  truckTutorialHighlight={coach.truck ?? homewardNudge}
                  standHighlight={standHighlight}
                  standItemHighlight={standItemHighlight}
                  standTutorialHighlight={coach.stand}
                />
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
                    key={`cell-${vectorKey(cell.position)}`}
                  />
                ))}
                {/* Settled sawdust sits on the floor, under everything that moves */}
                <DustLayer width={width} height={height} />
                {/* Cords run along the slab from the electric machines to
                  the wall outlets, under everything that sits on it */}
                <PowerCordLayer />
                <BroomSprite />

                {gameState.machineCrates.map((crate, index) => (
                  <MachineCrateSprite
                    crate={crate}
                    key={`crate-${index}-${vectorKey(crate.position)}`}
                  />
                ))}

                {/* The machines' hit shapes, under the loose stock on
                  purpose — a board lying across a machine is what you're
                  pointing at, not the machine under it */}
                <MachineHitTargets
                  machines={operableHere}
                  onHover={setTarget}
                  onClick={(machine) =>
                    isTargeted(machine) ? toggleSheet() : setTarget(machine)
                  }
                  onRightClick={(machine) => {
                    setTarget(machine);
                    openSheet(machine);
                  }}
                />

                {/* Piles draw in drop order, so the last piece set down on a
                  spot is on top — matching the pickup order E offers */}
                {gameState.materialPiles.map((pile) => {
                  const live =
                    reachablePiles.has(pile.material.id) && !benchDive;
                  return (
                    <MaterialPileSprite
                      key={`pile-${pile.material.id}`}
                      pile={pile}
                      highlighted={pile === pickupTarget && !benchDive}
                      tutorialTarget={
                        coach.matchesPile?.(pile.material) ?? false
                      }
                      onHover={live ? () => setPileTarget(pile) : undefined}
                      onRightClick={
                        live
                          ? () => {
                              setPileTarget(pile);
                              openFloorSheet();
                            }
                          : undefined
                      }
                    />
                  );
                })}
                {/* Every worktable's cast shadow, in one pass beneath all
                  of them: tables pushed together are one bench, and a
                  neighbour's shadow falling across the top butted against
                  it would draw a seam that isn't there. */}
                {machines
                  .filter((m) => m.type.worktable)
                  .map((worktable) => (
                    <pixiContainer
                      key={`shadow-${machineKey(worktable.state)}`}
                      x={cellToPixelCenter(worktable.position)[0]}
                      y={cellToPixelCenter(worktable.position)[1]}
                      angle={worktable.rotation * -90}
                    >
                      <WorktableShadowSprite machine={worktable} />
                    </pixiContainer>
                  ))}
                {[...machines]
                  // Worktables draw first so mounted benchtop machines sit on top
                  .sort(
                    (a, b) =>
                      Number(b.type.worktable ?? false) -
                      Number(a.type.worktable ?? false),
                  )
                  .map((machinePlacement) => (
                    <MachineSprite
                      key={machineKey(machinePlacement.state)}
                      machine={machinePlacement}
                      isSelected={
                        !gameState.player.away &&
                        gameState.player.carriedMachine == null &&
                        // Diving into a bench, the giant outline rim
                        // would only clutter the close-up
                        !benchDive &&
                        isTargeted(machinePlacement)
                      }
                      tutorialTarget={coach.machineTypeIds.has(
                        machinePlacement.type.id as MachineId,
                      )}
                    />
                  ))}
                {/* Where the machines' cut spray renders: over them all,
                  outside any one machine's outline filter — see
                  cutSprayLayer.ts. Childless on purpose; particles are
                  attach()ed, and RenderLayer's addChild throws. */}
                <pixiRenderLayer ref={setCutSprayLayer} />
                {/* Painted over the machines: a blocked lane cell is usually
                 *under* the machine that's blocking it */}
                <FeedLaneLayer />
                {collisionDebugRequested() && <CollisionDebugLayer />}
                <PlayerMotionLayer paused={paused} />
                <FootstepSoundLayer />
                <ShopVacSprite />
                {!gameState.player.away && truckStage === "parked" && (
                  <PersonSprite person={gameState.player} />
                )}
                {/* Dust in flight rides above the tools taking it */}
                <DustMotionLayer />
                <CarriedMachineLayer />
                {/* The hour of the day, over the whole world — the sky
                    outdoors, the bulbs on the slab. Last, so it lights
                    everything the camera holds rather than sitting under
                    half of it. */}
                <DaylightLayer
                  width={width}
                  height={height}
                  viewport={worldViewport}
                />
              </pixiContainer>
            </pixiContainer>
          </pixiContainer>
        </cutSprayLayerContext.Provider>
        {/* The bench scene, published by BenchWorkSurface, drawn in
              screen space above the world — outside the camera so the
              daylight pass can't darken the top under your hands. The
              dive layer swells the world about the bench and lands the
              scene on its footprint, one transform per frame. */}
        <BenchDiveLayer
          worldRef={benchDiveContainerRef}
          offsetX={offsetX}
          offsetY={offsetY}
          scale={scale}
        />
      </>
    );
  };

  return (
    <>
      <ShopKeyboardShortcuts />
      <HeldMovementListener
        enabled={
          !gameState.player.away &&
          !modalOpen &&
          truckStage === "parked" &&
          !leaningOverBench
        }
        captureVertical={truckMenuOpen}
      />
      <HeldKeyListener
        shortcut="operate-machine"
        enabled={
          !gameState.player.away && !modalOpen && truckStage === "parked"
        }
        onChange={(held) => updateGameState(setOperatingAction(held))}
      />
      <HeldKeyListener
        shortcut="wait"
        enabled={
          !gameState.player.away && !modalOpen && truckStage === "parked"
        }
        onChange={(held) => updateGameState(setWaitingAction(held))}
      />
      <WorldScene
        worldWidth={width}
        worldHeight={height}
        apron={LOT_APRON}
        containerProps={(view) => ({
          onPointerMove: (event) => handlePointerMove(event, view),
          onPointerLeave: clearAim,
        })}
        overlay={(view) => (
          // The DOM overlay sits exactly on the shop floor's box, so every
          // anchor inside keeps world-times-scale coordinates. The inner
          // wrapper rides the camera (CameraLayer sets its transform
          // imperatively; React never writes that style, so they can't
          // fight).
          <WorldOverlayBox
            view={view}
            inert={benchDive}
            className={`absolute z-30 pointer-events-none transition-opacity duration-150 ${
              benchDive ? "opacity-0" : "opacity-100"
            }`}
          >
            <div ref={overlayScrollRef} className="absolute inset-0">
              {/* Everything you can do, shown at the thing you'd do it to */}
              <ShopOverlayLayer
                width={view.scaledWidth}
                height={view.scaledHeight}
                scale={view.scale}
              />
            </div>
          </WorldOverlayBox>
        )}
      >
        {renderWorld}
      </WorldScene>
    </>
  );
};
