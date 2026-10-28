// Synthetic shader fixture, not a packaging render or a substitute for render QA.
import * as THREE from "three";
import { DenoiseMaterial } from "three-gpu-pathtracer";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";
import { renderDenoisedResult } from "../../src/render/denoise";

export function runGuidedDenoiseFixture() {
  const size = 128;
  const canvas = document.createElement("canvas");
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    preserveDrawingBuffer: true,
    premultipliedAlpha: false,
  });
  renderer.setSize(size, size, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;

  const artwork = document.createElement("canvas");
  artwork.width = artwork.height = size;
  const context = artwork.getContext("2d");
  context.fillStyle = "#b54e30";
  context.fillRect(0, 0, size, size);
  context.fillStyle = "#ffffff";
  context.fillRect(55, 0, 3, size);
  context.font = "bold 20px Arial";
  context.fillText("TEST", 12, 70);
  const pixels = context.getImageData(0, 0, size, size).data;

  const clean = new Float32Array(size * size * 4);
  const noisy = new Float32Array(clean.length);
  const color = new THREE.Color();
  let seed = 123456;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const offset = (y * size + x) * 4;
      const source = ((size - 1 - y) * size + x) * 4;
      color.setRGB(
        pixels[source] / 255,
        pixels[source + 1] / 255,
        pixels[source + 2] / 255,
        THREE.SRGBColorSpace,
      );
      const spike = random() < 0.08 ? 1.8 : 0;
      const variation = 0.65 + random() * 0.7;
      // Preserve supplied coverage, including antialiased partial alpha.
      const alpha = x < 8 ? 0 : x < 12 ? (x - 7) / 4 : 1;
      clean.set([color.r, color.g, color.b, alpha], offset);
      noisy.set(
        [
          color.r * variation + spike,
          color.g * variation + spike,
          color.b * variation + spike,
          alpha,
        ],
        offset,
      );
    }
  const makeTexture = (data) => {
    const texture = new THREE.DataTexture(
      data,
      size,
      size,
      THREE.RGBAFormat,
      THREE.FloatType,
    );
    texture.minFilter = texture.magFilter = THREE.NearestFilter;
    texture.needsUpdate = true;
    return texture;
  };
  const cleanMap = makeTexture(clean);
  const noisyMap = makeTexture(noisy);
  const map = new THREE.CanvasTexture(artwork);
  map.colorSpace = THREE.SRGBColorSpace;
  map.minFilter = map.magFilter = THREE.NearestFilter;
  const scene = new THREE.Scene();
  const background = new THREE.Color("#abcdee");
  scene.background = background;
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 30);
  camera.position.set(0, 0, 4);
  camera.updateMatrixWorld(true);
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(
      2 * 4 * Math.tan(Math.PI / 12),
      2 * 4 * Math.tan(Math.PI / 12),
    ),
    new THREE.MeshPhysicalMaterial({ map }),
  );
  scene.add(plane);
  const originalMaterial = plane.material;
  const read = () => {
    const array = new Uint8Array(size * size * 4);
    const gl = renderer.getContext();
    gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, array);
    return array;
  };
  // Radius zero gives the same ACES/output conversion without spatial filtering.
  const direct = (texture) => {
    const material = new DenoiseMaterial({
      map: texture,
      sigma: 1,
      kSigma: 0,
      threshold: 0.1,
    });
    const quad = new FullScreenQuad(material);
    try {
      renderer.setRenderTarget(null);
      quad.render(renderer);
      return read();
    } finally {
      quad.dispose();
      material.dispose();
    }
  };
  const region = (array) => {
    let sum = 0,
      sum2 = 0,
      count = 0;
    for (let y = 10; y < 40; y++)
      for (let x = 16; x < 40; x++) {
        const value = array[(y * size + x) * 4];
        sum += value;
        sum2 += value * value;
        count++;
      }
    return {
      mean: sum / count,
      deviation: Math.sqrt(sum2 / count - (sum / count) ** 2),
    };
  };
  try {
    const expected = direct(cleanMap);
    const before = direct(noisyMap);
    const results = [];
    for (const fine of [false, true]) {
      renderDenoisedResult(
        renderer,
        scene,
        camera,
        noisyMap,
        size,
        size,
        fine,
        DenoiseMaterial,
      );
      const after = read();
      let expectedStroke = 0,
        filteredStroke = 0,
        alphaError = 0;
      for (let y = 8; y < size - 8; y++) {
        const i = (y * size + 56) * 4;
        expectedStroke += expected[i];
        filteredStroke += after[i];
      }
      for (let i = 3; i < after.length; i += 4)
        alphaError = Math.max(alphaError, Math.abs(after[i] - noisy[i] * 255));
      results.push({
        quality: fine ? "fine" : "standard",
        before: region(before),
        after: region(after),
        strokeRatio: filteredStroke / expectedStroke,
        maximumAlphaError: alphaError,
        materialRestored: plane.material === originalMaterial,
        backgroundRestored: scene.background === background,
      });
    }
    return results;
  } finally {
    plane.geometry.dispose();
    originalMaterial.dispose();
    map.dispose();
    cleanMap.dispose();
    noisyMap.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
