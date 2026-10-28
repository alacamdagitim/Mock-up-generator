import * as THREE from "three";
import { layoutDefinition } from "../shared/layouts.mjs";

/** Presets describe intent; actual product bounds determine spacing and ground. */
export function arrangeProduct(
  root: THREE.Group,
  prototype: THREE.Group,
  id = "single",
  spacing = 1,
  depth = 1,
) {
  root.clear();
  prototype.updateMatrixWorld(true);
  const original = new THREE.Box3().setFromObject(prototype);
  const size = original.getSize(new THREE.Vector3());
  const factor = THREE.MathUtils.clamp(spacing, 0.8, 1.6);
  const unitX = Math.max(size.x, size.z * depth) / 2.34;
  const unitY = size.y / 3.6;
  const unitZ = Math.max(size.x, size.z * depth) / 2.34;
  const entries = layoutDefinition(id).items.map(([x, y, z, ry, rz, scale]) => {
    const model = prototype.clone(true);
    model.rotation.set(0, ry, rz);
    model.scale.set(scale, scale, scale * depth);
    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model);
    const center = bounds.getCenter(new THREE.Vector3());
    // Tilt changes the lowest corner. Ground every copy by its actual bounds.
    model.position.set(
      -center.x,
      -size.y / 2 - bounds.min.y + y * unitY,
      -center.z,
    );
    return {
      model,
      x: x * unitX,
      z: z * unitZ,
      bounds: bounds.translate(model.position),
    };
  });
  // Keep physical products from interpenetrating, including wide imported GLBs.
  // Evaluate at the slider's minimum so its entire range remains usable.
  let spread = 1;
  for (let i = 0; i < entries.length; i++)
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i],
        b = entries[j];
      const dx = Math.abs(a.x - b.x) * 0.8;
      if (dx < 0.001) continue;
      const overlapY =
        a.bounds.min.y < b.bounds.max.y && b.bounds.min.y < a.bounds.max.y;
      const dz = Math.abs(a.z - b.z) * 0.8;
      const widths =
        (a.bounds.max.x - a.bounds.min.x + b.bounds.max.x - b.bounds.min.x) / 2;
      const depths =
        (a.bounds.max.z - a.bounds.min.z + b.bounds.max.z - b.bounds.min.z) / 2;
      if (overlapY && dz < depths)
        spread = Math.max(spread, (widths + size.x * 0.06) / dx);
    }
  for (const entry of entries) {
    entry.model.position.x += entry.x * factor * spread;
    entry.model.position.z += entry.z * factor;
    root.add(entry.model);
  }
  root.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(root);
}

/** Fit all eight bounds corners in camera space, including depth and tilt. */
export function fittedDistance(
  bounds: THREE.Box3,
  camera: THREE.PerspectiveCamera,
  direction: THREE.Vector3,
  padding = 1.16,
) {
  const center = bounds.getCenter(new THREE.Vector3());
  const right = new THREE.Vector3()
    .crossVectors(camera.up, direction)
    .normalize();
  const up = new THREE.Vector3().crossVectors(direction, right).normalize();
  const tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / camera.zoom;
  const tanX = tanY * Math.max(0.01, camera.aspect);
  let distance = camera.near * 2;
  for (const x of [bounds.min.x, bounds.max.x])
    for (const y of [bounds.min.y, bounds.max.y])
      for (const z of [bounds.min.z, bounds.max.z]) {
        const corner = new THREE.Vector3(x, y, z).sub(center);
        distance = Math.max(
          distance,
          corner.dot(direction) +
            padding *
              Math.max(
                Math.abs(corner.dot(right)) / tanX,
                Math.abs(corner.dot(up)) / tanY,
              ),
        );
      }
  return distance;
}
