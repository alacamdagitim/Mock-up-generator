import * as THREE from "three";
import type { WebGLPathTracer } from "three-gpu-pathtracer";

/** Keep light samples tied to full-image pixels, across every camera window. */
export function configureRenderSampling(tracer: WebGLPathTracer) {
  // Pinned 0.0.24 exposes the physical material here. Its default stratified
  // sequence shares random light choices across a whole frame; restarting it
  // for each window makes visible rectangular exposure changes at 64 samples.
  const pinned = tracer as WebGLPathTracer & {
    stableNoise: boolean;
    _pathTracer: { material: THREE.ShaderMaterial };
  };
  const material = pinned._pathTracer.material;
  const initialize = "rng_initialize( gl_FragCoord.xy, seed );";
  const pixelIndex =
    "sobolPixelIndex = ( uint( gl_FragCoord.x ) << 16 ) | uint( gl_FragCoord.y );";
  if (
    !material.fragmentShader.includes(initialize) ||
    !material.fragmentShader.includes(pixelIndex)
  )
    throw new Error("Render motorunun örnekleme sürümü desteklenmiyor.");
  const offset = new THREE.Vector2();
  material.uniforms.outputPixelOffset = { value: offset };
  material.fragmentShader =
    "uniform vec2 outputPixelOffset;\n" +
    material.fragmentShader
      .replace(
        initialize,
        "rng_initialize( gl_FragCoord.xy + outputPixelOffset, seed );",
      )
      .replace(
        pixelIndex,
        "sobolPixelIndex = ( uint( gl_FragCoord.x + outputPixelOffset.x ) << 16 ) | uint( gl_FragCoord.y + outputPixelOffset.y );",
      );
  material.defines.RANDOM_TYPE = 1; // Library's per-pixel scrambled Sobol sampler.
  material.needsUpdate = true;
  pinned.stableNoise = true; // Restart the same sample indices for each window.
  return (x: number, y: number) => offset.set(x, y);
}
