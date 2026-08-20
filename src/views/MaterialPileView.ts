import { Container } from "pixi.js";
import { cellToPixelVec } from "./shop-scale";
import { BaseEntity } from "../core/entity/BaseEntity";
import { Entity } from "../core/entity/Entity";
import { GameSprite } from "../core/entity/GameSprite";
import { on } from "../core/entity/handler";
import { MaterialInstance } from "../game/Materials";
import { MaterialPileEntity } from "../sim/entities/MaterialPileEntity";
import { createMaterialSprite } from "./material-sprites/MaterialSprite";
import { FLOOR_ITEMS_Z } from "./z-order";

/**
 * One pile where it lies — the old MaterialPileSprite as a view entity:
 * `position` is the piece's center point in continuous cell coordinates
 * and `rotation` is the orientation it was dropped in — piles are
 * free-floating, only machines live on the grid.
 *
 * The material's drawing rebuilds only when the pile holds a different
 * instance (materials are immutable data); position and rotation are
 * read straight off the sim entity every frame. The targeting outline
 * and mouse work arrive with the interaction port (phase 4).
 */
export class MaterialPileView extends BaseEntity implements Entity {
  private root: Container & GameSprite;
  private drawn: MaterialInstance | null = null;

  constructor(private pile: MaterialPileEntity) {
    super();
    this.root = new Container() as Container & GameSprite;
    this.root.layerName = "floorItems";
    this.root.zIndex = FLOOR_ITEMS_Z.piles;
    this.sprite = this.root;
  }

  @on("render")
  onRender() {
    if (this.pile.material !== this.drawn) {
      this.drawn = this.pile.material;
      for (const child of [...this.root.children]) {
        child.destroy({ children: true });
      }
      this.root.addChild(createMaterialSprite(this.pile.material));
    }
    const [x, y] = cellToPixelVec(this.pile.position);
    this.root.position.set(x, y);
    this.root.rotation = this.pile.rotation;
  }
}
