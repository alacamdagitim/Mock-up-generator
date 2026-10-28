import * as THREE from "three";
// Original parametric pouch: heat-sealed edges, tear notches, inflated body and bottom folds.
export function pouchSurface(back = false) {
  const nx = 64,
    ny = 80,
    positions = [],
    uv = [],
    indices = [];
  for (let j = 0; j <= ny; j++)
    for (let i = 0; i <= nx; i++) {
      const u = i / nx,
        v = j / ny,
        edge = Math.abs(2 * u - 1);
      const notch =
        0.025 *
        Math.exp(-Math.pow((v - 0.905) / 0.013, 2)) *
        Math.pow(edge, 20);
      const width = 1.17 + 0.025 * Math.sin(Math.PI * v) - notch;
      const x = (2 * u - 1) * width,
        y = (v - 0.5) * 3.6;
      const sideEnvelope = Math.pow(Math.max(0, Math.sin(Math.PI * u)), 0.48);
      const topEnvelope =
        THREE.MathUtils.smoothstep(v, 0.015, 0.13) *
        (1 - THREE.MathUtils.smoothstep(v, 0.82, 0.96));
      const belly =
        0.44 *
        sideEnvelope *
        topEnvelope *
        (0.88 + 0.12 * Math.sin(Math.PI * v));
      const seam = 0.012 + 0.012 * Math.sin(Math.PI * u);
      const wrinkles =
        0.014 *
          Math.sin(u * 79 + v * 16) *
          Math.pow(edge, 8) *
          Math.sin(Math.PI * v) +
        0.018 *
          Math.sin(u * 28 + v * 42) *
          Math.exp(-Math.pow((v - 0.13) / 0.09, 2)) *
          sideEnvelope +
        0.009 *
          Math.sin(u * 39 - v * 18) *
          Math.exp(-Math.pow((v - 0.81) / 0.07, 2)) *
          sideEnvelope;
      const z = seam + belly + wrinkles;
      positions.push(back ? -x : x, y, back ? -z : z);
      uv.push(u, v);
    }
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i,
        b = a + 1,
        c = a + nx + 1,
        d = c + 1;
      indices.push(a, b, d, a, d, c);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}
