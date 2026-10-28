import * as THREE from "three";
import { activeModel } from "./catalog";
import { addPouchStructure } from "../shared/pouch-structure.mjs";
/** Shared original mesh/material factory for live previews and rendered catalog covers. */
export function createPouchAsset(renderer: THREE.WebGLRenderer) {
  // Deterministic microscopic film grain, small and generated locally.
  const grainCanvas = document.createElement("canvas");
  grainCanvas.width = 256;
  grainCanvas.height = 256;
  const grainCtx = grainCanvas.getContext("2d")!,
    pixels = grainCtx.createImageData(256, 256);
  let seed = 34219;
  for (let i = 0; i < pixels.data.length; i += 4) {
    seed = (1664525 * seed + 1013904223) >>> 0;
    const value = 120 + (seed >>> 28);
    pixels.data.set([value, value, value, 255], i);
  }
  grainCtx.putImageData(pixels, 0, 0);
  const grain = new THREE.CanvasTexture(grainCanvas);
  grain.colorSpace = THREE.NoColorSpace;
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  grain.repeat.set(5, 7);
  grain.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const prototype = new THREE.Group(),
    maps: THREE.CanvasTexture[] = [],
    materials: THREE.MeshPhysicalMaterial[] = [];
  for (const surface of activeModel.surfaces()) {
    const c = document.createElement("canvas");
    c.width = 600;
    c.height = 900;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 600, 900);
    const map = new THREE.CanvasTexture(c);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    maps.push(map);
    const mat = new THREE.MeshPhysicalMaterial({
      map,
      roughness: 0.59,
      metalness: 0,
      clearcoat: 0.035,
      clearcoatRoughness: 0.56,
      ior: 1.46,
      bumpMap: grain,
      bumpScale: 0.0038,
      side: THREE.DoubleSide,
    });
    materials.push(mat);
    const mesh = new THREE.Mesh(surface.geometry, mat);
    mesh.name = `print_${surface.face}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    prototype.add(mesh);
  }
  const seal = new THREE.MeshPhysicalMaterial({
    color: "#ffffff",
    roughness: 0.665,
    metalness: 0,
    clearcoat: 0.0245,
    clearcoatRoughness: 0.56,
    ior: 1.46,
    bumpMap: grain,
    bumpScale: 0.0021,
  });
  addPouchStructure(prototype, seal);
  return {
    prototype,
    maps,
    materials,
    seal,
    grain,
    dispose() {
      const geometries = new Set<THREE.BufferGeometry>();
      const allMaterials = new Set<THREE.Material>();
      prototype.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          geometries.add(o.geometry);
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
            allMaterials.add(m),
          );
        }
      });
      geometries.forEach((g) => g.dispose());
      allMaterials.forEach((m) => m.dispose());
      maps.forEach((m) => m.dispose());
      grain.dispose();
    },
  };
}
