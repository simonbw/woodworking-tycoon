import { Vector } from "./Vectors";

export interface ShopInfo {
  name: string;
  electricity: 120 | 240;
  size: Vector;
  materialDropoffPosition: Vector;
}
