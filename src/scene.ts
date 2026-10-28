import { Color } from "three";
export function sceneColors(background: string) {
  const base = new Color(background);
  return {
    top: "#" + base.clone().lerp(new Color("#ffffff"), 0.48).getHexString(),
    bottom: "#" + base.clone().lerp(new Color("#95aed0"), 0.25).getHexString(),
  };
}
