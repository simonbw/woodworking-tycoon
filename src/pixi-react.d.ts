// Type declarations for @pixi/react v8 components
import type {
  Container,
  Graphics,
  RenderLayer,
  Sprite,
  Text,
  TextStyle,
  TextStyleOptions,
  TilingSprite,
  Texture,
} from "pixi.js";

type PixiProps<T> = Partial<T> & {
  x?: number;
  y?: number;
  rotation?: number;
  angle?: number;
  scale?: number | { x: number; y: number };
  alpha?: number;
  tint?: number;
  anchor?: number | { x: number; y: number };
  pivot?: number | { x: number; y: number };
  visible?: boolean;
  interactive?: boolean;
  hitArea?: any;
  onClick?: (event: any) => void;
  onRightClick?: (event: any) => void;
  onPointerDown?: (event: any) => void;
  onPointerUp?: (event: any) => void;
  onPointerMove?: (event: any) => void;
  onPointerOver?: (event: any) => void;
  onPointerOut?: (event: any) => void;
  key?: string | number;
  ref?: any;
};

type DrawCallback = (graphics: Graphics) => void;

declare global {
  namespace JSX {
    interface IntrinsicElements {
      pixiContainer: PixiProps<Container> & {
        children?: React.ReactNode;
      };
      pixiGraphics: PixiProps<Graphics> & {
        draw?: DrawCallback;
      };
      // No children: RenderLayer takes objects via attach(), not addChild
      pixiRenderLayer: PixiProps<RenderLayer>;
      pixiSprite: PixiProps<Sprite> & {
        texture?: string | Texture;
        image?: string;
      };
      pixiText: PixiProps<Text> & {
        text?: string;
        style?: TextStyle | Partial<TextStyleOptions>;
        resolution?: number;
      };
      pixiTilingSprite: PixiProps<TilingSprite> & {
        texture?: string | Texture;
        tileScale?: number | { x: number; y: number };
        tilePosition?: { x: number; y: number };
        width?: number;
        height?: number;
      };
    }
  }
}
