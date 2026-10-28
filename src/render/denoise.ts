import * as THREE from "three";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";
import type { DenoiseMaterial } from "three-gpu-pathtracer";

/** Cross-bilateral filtering of real samples, guided by snapshot ink/geometry. */
export function renderDenoisedResult(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  radiance: THREE.Texture,
  width: number,
  height: number,
  fine: boolean,
  Denoise: typeof DenoiseMaterial,
) {
  const guides = new THREE.WebGLRenderTarget(width, height, {
    count: 2,
    format: THREE.RGBAFormat,
    type: THREE.HalfFloatType,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: true,
  });
  const cache = new Map<THREE.Material, THREE.ShaderMaterial>();
  const originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  const background = scene.background;
  let denoiser: DenoiseMaterial | null = null;
  let quad: FullScreenQuad | null = null;
  const guideMaterial = (source: THREE.Material) => {
    let material = cache.get(source);
    if (material) return material;
    const surface = source as THREE.MeshStandardMaterial;
    surface.map?.updateMatrix();
    material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      side: source.side,
      uniforms: {
        ink: { value: surface.color ?? new THREE.Color(1, 1, 1) },
        image: { value: surface.map },
        hasImage: { value: !!surface.map },
        mapTransform: { value: surface.map?.matrix ?? new THREE.Matrix3() },
      },
      vertexShader: `
        uniform mat3 mapTransform;
        out vec2 printUv;
        out vec3 viewNormal;
        out float viewDepth;
        void main() {
          vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
          printUv = (mapTransform * vec3(uv, 1.0)).xy;
          viewNormal = normalMatrix * normal;
          viewDepth = -viewPosition.z;
          gl_Position = projectionMatrix * viewPosition;
        }`,
      fragmentShader: `
        uniform vec3 ink;
        uniform sampler2D image;
        uniform bool hasImage;
        in vec2 printUv;
        in vec3 viewNormal;
        in float viewDepth;
        layout(location = 0) out vec4 albedo;
        layout(location = 1) out vec4 geometry;
        void main() {
          vec3 color = ink;
          if (hasImage) color *= texture(image, printUv).rgb;
          albedo = vec4(color, 1.0);
          geometry = vec4(normalize(viewNormal) * 0.5 + 0.5, viewDepth);
        }`,
    });
    cache.set(source, material);
    return material;
  };
  try {
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      originals.set(object, object.material);
      object.material = Array.isArray(object.material)
        ? object.material.map(guideMaterial)
        : guideMaterial(object.material);
    });
    scene.background = null;
    renderer.setRenderTarget(guides);
    renderer.setViewport(0, 0, width, height);
    renderer.setScissorTest(false);
    renderer.setClearColor(0, 0);
    renderer.clear();
    renderer.render(scene, camera);
    for (const [mesh, material] of originals) mesh.material = material;
    scene.background = background;

    denoiser = new Denoise({
      map: radiance,
      sigma: fine ? 2.2 : 2.5,
      kSigma: 2,
      threshold: 0.055,
    });
    denoiser.uniforms.albedoGuide = { value: guides.textures[0] };
    denoiser.uniforms.geometryGuide = { value: guides.textures[1] };
    denoiser.fragmentShader = denoiser.fragmentShader
      .replace(
        "uniform sampler2D map;",
        `uniform sampler2D map;
        uniform sampler2D albedoGuide;
        uniform sampler2D geometryGuide;`,
      )
      .replace(
        /vec4 smartDeNoise\([\s\S]*?void main\(\)/,
        `vec4 smartDeNoise(sampler2D tex, vec2 uv, float sigma, float kSigma, float threshold) {
          float radius = round(kSigma * sigma);
          vec2 size = vec2(textureSize(tex, 0));
          vec4 center = texture2D(tex, uv);
          vec4 ink = texture2D(albedoGuide, uv);
          vec4 shape = texture2D(geometryGuide, uv);
          vec3 sum = vec3(0.0);
          float alphaWeight = 0.0;
          for (float x = -radius; x <= radius; x++) {
            for (float y = -radius; y <= radius; y++) {
              vec2 offset = vec2(x, y);
              if (dot(offset, offset) > radius * radius) continue;
              vec2 sampleUv = uv + offset / size;
              vec4 sampleInk = texture2D(albedoGuide, sampleUv);
              vec4 sampleShape = texture2D(geometryGuide, sampleUv);
              vec4 inkDelta = sampleInk - ink;
              vec3 normalDelta = sampleShape.rgb - shape.rgb;
              float depthDelta = (sampleShape.a - shape.a) / max(0.05, shape.a * 0.03);
              float weight = exp(-dot(offset, offset) / (2.0 * sigma * sigma))
                * exp(-dot(inkDelta, inkDelta) / (2.0 * threshold * threshold))
                * exp(-dot(normalDelta, normalDelta) / 0.02)
                * exp(-depthDelta * depthDelta * 0.5);
              vec4 sampleColor = texture2D(tex, sampleUv);
              // Compress HDR outliers before averaging. Artwork edges are
              // determined by the noise-free ink guide, never a firefly pixel.
              sum += toneMapping(sampleColor.rgb) * (sampleColor.a * weight);
              alphaWeight += sampleColor.a * weight;
            }
          }
          vec3 filtered = alphaWeight > 0.00001 ? sum / alphaWeight : vec3(0.0);
          return vec4(filtered, center.a);
        }
        void main()`,
      )
      // Filtering already compressed the radiance exactly once above.
      .replace("#include <tonemapping_fragment>", "");
    quad = new FullScreenQuad(denoiser);
    renderer.setRenderTarget(null);
    renderer.setViewport(0, 0, width, height);
    renderer.setScissorTest(false);
    renderer.clear();
    quad.render(renderer);
  } finally {
    for (const [mesh, material] of originals) mesh.material = material;
    scene.background = background;
    renderer.setRenderTarget(null);
    quad?.dispose();
    denoiser?.dispose();
    for (const material of cache.values()) material.dispose();
    guides.dispose();
  }
}
