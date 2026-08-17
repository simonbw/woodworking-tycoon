import { Container, Graphics, Text } from "pixi.js";
import { cellToPixel } from "./shop-scale";
import { BaseEntity } from "../core/entity/BaseEntity";
import { Entity } from "../core/entity/Entity";
import { GameSprite } from "../core/entity/GameSprite";
import { on } from "../core/entity/handler";
import { ShopInfo as ShopInfoData } from "../game/ShopInfo";
import { standRect } from "../game/stand";
import { StandEntity } from "../sim/entities/StandEntity";
import { ShopInfo } from "../sim/singletons/ShopInfo";
import { drawMaterialGlyph } from "./material-glyph";

/**
 * The for-sale stand: a plank table in the grass at the street end of
 * the lot, with a hand-written sign leaning beside it — the old
 * StandSprite as a view entity, paired with the StandEntity that owns
 * the pieces set out. Where it sits — and the solid the walking body
 * bounces off — comes from standRect in stand.ts; this view only draws
 * onto that footprint. Procedural on purpose for now (see
 * docs/asset-backlog.md). Targeting and tutorial highlights are phase
 * 4/5.
 */

const TABLETOP = 0x8a6f4d;
const TABLETOP_EDGE = 0x6d5639;
const PLANK_GAP = 0x77603f;
const SIGN_BOARD = 0xe8e0cd;
const SIGN_POST = 0x5c4a30;
const SIGN_INK = 0x2b2620;

export class StandView extends BaseEntity implements Entity {
  private root: Container & GameSprite;
  private table: Graphics;
  private pieces: Container;
  private sign: Container;

  /** What was last drawn, so table/pieces only rebuild on change. */
  private drawnFor = "";
  private piecesFor = "";

  constructor(private stand: StandEntity) {
    super();
    this.root = new Container() as Container & GameSprite;
    this.root.layerName = "environment";

    this.table = new Graphics();
    this.pieces = new Container();
    this.sign = new Container();

    const signBoard = new Graphics();
    // A stake with a board nailed across it, planted street-side of the
    // table. Drawn in local coordinates; the container places it.
    signBoard.rect(-1.5, 0, 3, 14);
    signBoard.fill(SIGN_POST);
    signBoard.rect(-16, -14, 32, 18);
    signBoard.fill(SIGN_BOARD);
    signBoard.rect(-16, -14, 32, 18);
    signBoard.stroke({ width: 1, color: SIGN_POST });

    const signText = new Text({
      text: "FOR\nSALE",
      resolution: 4,
      style: {
        fontFamily: "Shantell Notes",
        fontWeight: "700",
        fontSize: 7,
        lineHeight: 7,
        align: "center",
        fill: SIGN_INK,
      },
    });
    signText.anchor.set(0.5);
    signText.position.set(0, -5);

    this.sign.addChild(signBoard, signText);
    this.root.addChild(this.table, this.pieces, this.sign);
    this.sprite = this.root;
  }

  private shopInfo(): ShopInfoData | undefined {
    return this.game.entities.tryGetSingleton(ShopInfo)?.info;
  }

  @on("render")
  onRender() {
    const shopInfo = this.shopInfo();
    if (!shopInfo) return;

    const rect = standRect(shopInfo);
    const left = cellToPixel(rect.min[0]);
    const top = cellToPixel(rect.min[1]);
    const width = cellToPixel(rect.max[0] - rect.min[0]);
    const height = cellToPixel(rect.max[1] - rect.min[1]);

    this.root.position.set(left, top);
    // The sign, planted in the grass at the table's street end
    this.sign.position.set(width / 2, height + 20);

    const key = `${width}x${height}`;
    if (key !== this.drawnFor) {
      this.drawnFor = key;
      this.drawTable(width, height);
      // A resized table refans the merchandise too
      this.piecesFor = "";
    }

    const piecesKey = this.stand.pieces.map((piece) => piece.id).join();
    if (piecesKey !== this.piecesFor) {
      this.piecesFor = piecesKey;
      this.rebuildPieces(width, height);
    }
  }

  private drawTable(width: number, height: number) {
    const g = this.table;
    g.clear();
    // The tabletop, edge band first so the planks read as sitting on it
    g.rect(0, 0, width, height);
    g.fill(TABLETOP_EDGE);
    g.rect(2, 2, width - 4, height - 4);
    g.fill(TABLETOP);
    // Plank seams across the top
    const planks = 4;
    for (let i = 1; i < planks; i++) {
      g.rect(2, (height / planks) * i, width - 4, 1.5);
    }
    g.fill(PLANK_GAP);
  }

  /** What's out for sale, fanned across the tabletop like the truck's
   * bed cargo — newest lands on top, matching what E takes back. */
  private rebuildPieces(width: number, height: number) {
    this.pieces.removeChildren().forEach((child) => child.destroy());
    this.stand.pieces.forEach((material, i) => {
      const item = new Graphics();
      drawMaterialGlyph(item, material);
      item.position.set(
        width / 2 + (i % 2 === 0 ? -3 : 3),
        height / 2 + ((i % 3) - 1) * 12,
      );
      // Lengthwise down the tall table, at merchandise size so pieces
      // read as sitting on it rather than swallowing it
      item.angle = ((i * 11) % 25) - 12;
      item.scale.set(0.55);
      this.pieces.addChild(item);
    });
  }
}
