import * as THREE from "three";

/** Original closure details, shared by the editor and standalone asset export. */
export function addPouchStructure(group, material) {
  let index = 0;
  for (const y of [1.755, 1.55, 1.51])
    for (const z of [-0.027, 0.027]) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(2.31, y === 1.755 ? 0.055 : 0.011, 0.012),
        material,
      );
      mesh.name = `seal_${index++}`;
      mesh.position.set(0, y, z);
      mesh.castShadow = true;
      group.add(mesh);
    }
  const gusset = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 16), material);
  gusset.name = "bottom_gusset";
  // Keep this approximate bottom closure inside the sealed front/back edge.
  // The former deep ellipsoid protruded as an unrelated white oval in front.
  gusset.scale.set(1.13, 0.08, 0.018);
  gusset.position.y = -1.73;
  gusset.castShadow = true;
  group.add(gusset);
}
