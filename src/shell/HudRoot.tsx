import React from "react";
import { Persistence } from "../config/constants";
import { ReactEntity } from "../core/ReactEntity";
import { EngineHud } from "./hud/EngineHud";
import { ShellProvider } from "./useShell";

/**
 * The DOM layer's mount point: a ReactEntity hosting the HUD tree over
 * the canvas. `autoRender` is off — the root renders once when added,
 * and everything after flows through the components' own
 * `useSyncExternalStore` subscriptions to the ShellStore, so a quiet
 * frame costs the DOM nothing (migration decision 8).
 *
 * Requires the ShellStore to be in the game already (ShellProvider
 * resolves it at first render).
 */
export class HudRoot extends ReactEntity {
  persistenceLevel: number = Persistence.Permanent;
  pausable = false;

  constructor() {
    super(
      () => (
        <ShellProvider game={this.game}>
          <EngineHud />
        </ShellProvider>
      ),
      false,
    );
  }

  onAdd() {
    super.onAdd();
    // A fixed sheet over the whole canvas that ignores the pointer;
    // the HUD's chips opt back in (the HomePage layout contract).
    Object.assign(this.el.style, {
      position: "fixed",
      inset: "0",
      zIndex: "10",
      pointerEvents: "none",
    });
    this.reactRender();
  }
}
