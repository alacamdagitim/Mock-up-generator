import { Color, type MeshPhysicalMaterial } from "three";
import type { Presentation } from "./types";

/** Linear material parameters; artwork and its UV placement remain untouched. */
export function applyPouchFinish(
  materials: MeshPhysicalMaterial[],
  seal: MeshPhysicalMaterial,
  settings: Presentation,
): void {
  const substrate = settings.substrate || "white";
  const finish =
    settings.finishing || (settings.material === "glossy" ? "gloss" : "matte");
  const glossy = finish === "gloss";
  const uncoated = finish === "none";
  const paper = substrate === "kraft";
  const metallic = substrate === "metallic";
  const tint = new Color(paper ? "#b59362" : metallic ? "#e0e1e2" : "#ffffff");

  // Kraft is a diffuse paper surface. Only an explicitly selected gloss
  // laminate adds a controlled coat; matte paper never becomes waxy plastic.
  const roughness = paper
    ? glossy
      ? 0.4
      : uncoated
        ? 0.89
        : 0.83
    : metallic
      ? glossy
        ? 0.29
        : uncoated
          ? 0.52
          : 0.48
      : glossy
        ? 0.3
        : uncoated
          ? 0.7
          : 0.59;
  const clearcoat = glossy
    ? paper
      ? 0.24
      : 0.48
    : paper || uncoated
      ? 0
      : 0.035;
  const coatRoughness = glossy ? (paper ? 0.32 : 0.25) : 0.56;
  const bumpScale = paper ? (glossy ? 0.005 : 0.011) : glossy ? 0.0014 : 0.0038;

  [...materials, seal].forEach((material) => {
    const previousCoat = material.clearcoat > 0;
    material.roughness =
      material === seal ? Math.min(1, roughness + 0.075) : roughness;
    material.metalness = metallic ? (glossy ? 0.68 : 0.6) : 0;
    material.clearcoat = material === seal ? clearcoat * 0.7 : clearcoat;
    material.clearcoatRoughness = coatRoughness;
    material.ior = paper ? 1.44 : 1.46;
    material.specularIntensity = paper && !glossy ? 0.65 : 1;
    material.bumpScale = material === seal ? bumpScale * 0.55 : bumpScale;
    if (material !== seal) material.color.copy(tint);
    // Most controls only update uniforms. Recompile only if the coat shader
    // branch changes, rather than on background/exposure adjustments.
    if (previousCoat !== material.clearcoat > 0) material.needsUpdate = true;
  });
}
