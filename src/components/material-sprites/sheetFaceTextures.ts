import { SheetGoodKind } from "../../game/Materials";

/**
 * The raster face art for sheet goods: seamless square photo tiles, cut
 * from the source images under assets/textures/materials. A kind with no
 * entry here (particle board, so far) still draws its face procedurally
 * in SheetGoodSprite.
 *
 * `spanInches` is the stretch of real sheet face the image covers, so
 * the renderer can window into it at true scale: a piece's face region
 * (SheetFaceRegion) is measured in inches, and the fill matrix converts
 * through this span. The images tile, so regions past the span wrap.
 */
export interface SheetFaceTexture {
  readonly src: string;
  readonly spanInches: number;
}

export const SHEET_FACE_TEXTURES: Partial<
  Record<SheetGoodKind, SheetFaceTexture>
> = {
  plywoodA: {
    src: "/images/textures/sheet-plywood-birch.jpg",
    spanInches: 96,
  },
  plywoodB: {
    src: "/images/textures/sheet-plywood-fir.jpg",
    spanInches: 96,
  },
  plywoodC: {
    src: "/images/textures/sheet-plywood-fir-knotty.jpg",
    spanInches: 96,
  },
  osb: {
    src: "/images/textures/sheet-osb.jpg",
    spanInches: 48,
  },
  mdf: {
    src: "/images/textures/sheet-mdf.jpg",
    spanInches: 48,
  },
  // White melamine facing — which is why the game's particle board has
  // always drawn whitish. The crumbly chip core still shows on the edge.
  particleBoard: {
    src: "/images/textures/sheet-melamine.jpg",
    spanInches: 48,
  },
};

export const SHEET_FACE_TEXTURE_ASSETS = Object.values(SHEET_FACE_TEXTURES).map(
  (texture) => texture.src,
);
