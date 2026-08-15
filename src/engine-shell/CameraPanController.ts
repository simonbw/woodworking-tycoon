import { TickLayerName } from "../config/tickLayers";
import { BaseEntity } from "../core/entity/BaseEntity";
import { Entity } from "../core/entity/Entity";
import { on } from "../core/entity/handler";

const PAN_SPEED = 15; // world units per second
const ZOOM_RATE = 1.5; // zoom factor per second held

/**
 * Phase-0 camera control for the engine shell: WASD/arrows pan, Q/E zoom.
 * Replaced by camera-follow once the player entity exists (phase 3).
 */
export class CameraPanController extends BaseEntity implements Entity {
  pausable = false;
  tickLayer: TickLayerName = "input";

  @on("tick")
  onTick(dt: number) {
    const { io, camera } = this.game;

    const move = io.getMovementVector();
    camera.x += move[0] * PAN_SPEED * dt;
    camera.y += move[1] * PAN_SPEED * dt;

    if (io.isKeyDown("KeyE")) {
      camera.z *= ZOOM_RATE ** dt;
    }
    if (io.isKeyDown("KeyQ")) {
      camera.z /= ZOOM_RATE ** dt;
    }
  }
}
