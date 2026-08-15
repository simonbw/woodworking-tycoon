import React from "react";
import { createRoot, Root } from "react-dom/client";
import { BaseEntity } from "./entity/BaseEntity";
import { Entity } from "./entity/Entity";
import { on } from "./entity/handler";

/**
 * Hosts a React tree over the canvas.
 *
 * With `autoRender` on, the tree re-renders every frame. Our UI roots pass
 * `autoRender = false` and call `reactRender()` themselves when the state
 * they present actually changes.
 */
export class ReactEntity extends BaseEntity implements Entity {
  el!: HTMLDivElement;

  reactRoot!: Root;

  constructor(
    public getReactContent: () => React.ReactElement,
    public autoRender = true,
  ) {
    super();
  }

  reactRender() {
    this.reactRoot?.render(this.getReactContent());
  }

  @on("render")
  onRender() {
    if (this.autoRender) {
      this.reactRender();
    }
  }

  @on("add")
  onAdd() {
    this.el = document.createElement("div");
    document.body.append(this.el);
    this.reactRoot = createRoot(this.el);
  }

  @on("destroy")
  onDestroy() {
    this.el.remove();
    this.reactRoot.unmount();
  }
}
