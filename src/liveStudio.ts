import * as THREE from "three";
import type { Presentation } from "./types";

/** Original studio cards: a dark surround and broad neutral softboxes.
 * Baked once to GGX-prefiltered radiance; no remote HDRI, render loop or image asset.
 */
export function createLiveStudioEnvironment(
  renderer: THREE.WebGLRenderer,
  mobile: boolean,
) {
  const studio = new THREE.Scene();
  const geometry = new THREE.PlaneGeometry(1, 1);
  const materials: THREE.MeshBasicMaterial[] = [];
  const card = (
    position: [number, number, number],
    width: number,
    height: number,
    radiance: number,
    tint = "#ffffff",
  ) => {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(tint).multiplyScalar(radiance),
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    materials.push(material);
    const panel = new THREE.Mesh(geometry, material);
    panel.position.set(...position);
    panel.scale.set(width, height, 1);
    panel.lookAt(0, 0, 0);
    studio.add(panel);
  };
  studio.background = new THREE.Color().setRGB(0.045, 0.045, 0.045);
  card([-4.5, 3.8, 5], 5.5, 7.5, 4.2);
  card([5, 1, 3], 2.6, 6, 0.85);
  card([2, 3.5, -4.5], 2, 6.5, 3.4);
  card([-1, 6, -0.5], 5, 3, 2.2);
  const generator = new THREE.PMREMGenerator(renderer);
  try {
    return generator.fromScene(studio, 0.025, 0.1, 30, {
      size: mobile ? 128 : 256,
    });
  } finally {
    generator.dispose();
    geometry.dispose();
    materials.forEach((material) => material.dispose());
    studio.clear();
  }
}

/** Preserve dark ink and a shaded side on white packaging, rather than fill wash. */
export function liveStudioLighting(lighting: Presentation["lighting"]) {
  const profiles = {
    softbox: {
      key: 1.8,
      fill: 0.4,
      rim: 1.1,
      environment: 0.95,
      ambient: 0.1,
      exposure: 0.95,
    },
    daylight: {
      key: 2.5,
      fill: 0.45,
      rim: 0.8,
      environment: 0.85,
      ambient: 0.12,
      exposure: 0.9,
    },
    dramatic: {
      key: 2.8,
      fill: 0.07,
      rim: 1.5,
      environment: 0.38,
      ambient: 0.025,
      exposure: 0.92,
    },
  };
  return profiles[lighting || "softbox"];
}
