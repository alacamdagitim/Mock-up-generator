import * as THREE from "three";
import { LAYOUTS } from "../shared/layouts.mjs";
import { arrangeProduct, fittedDistance } from "./productLayout";
import { createContactShadow } from "./ContactShadow";
import type { Presentation } from "./types";

/** Reuse the live GPU context; never allocate eleven independent viewers. */
export async function createLayoutCovers(
  renderer: THREE.WebGLRenderer,
  prototype: THREE.Group,
  source: THREE.Scene,
  settings: Presentation,
  external: boolean,
  signal?: AbortSignal,
) {
  const width = 384,
    height = 256;
  const target = new THREE.WebGLRenderTarget(width, height, {
    samples: Math.min(4, renderer.capabilities.maxSamples),
  });
  target.texture.colorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#f1f2f5");
  scene.environment = source.environment;
  scene.environmentIntensity = source.environmentIntensity;
  const root = new THREE.Group();
  scene.add(root);
  for (const child of source.children)
    if (child instanceof THREE.Light) {
      const light = child.clone();
      if (light instanceof THREE.DirectionalLight) {
        light.castShadow = false;
        light.position.copy(child.position).normalize().multiplyScalar(12);
        light.target = new THREE.Object3D();
        scene.add(light.target);
      }
      scene.add(light);
    }
  const shadow = createContactShadow(renderer, 256);
  scene.add(shadow.mesh);
  const camera = new THREE.PerspectiveCamera(34, width / height, 0.05, 500);
  const direction = new THREE.Vector3(0.27, 0.13, 1).normalize();
  const pixels = new Uint8Array(width * height * 4);
  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  const ctx = output.getContext("2d")!;
  const image = ctx.createImageData(width, height);
  const covers: Record<string, string> = {};
  try {
    for (const layout of LAYOUTS) {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      if (signal?.aborted || renderer.getContext().isContextLost())
        throw new DOMException("İptal edildi", "AbortError");
      // Nothing is held across the await: interactive rendering can continue.
      const previous = renderer.getRenderTarget();
      const viewport = renderer.getViewport(new THREE.Vector4());
      const scissor = renderer.getScissor(new THREE.Vector4());
      const scissorTest = renderer.getScissorTest();
      const shadows = renderer.shadowMap.enabled;
      try {
        const depth = external ? 1 : 0.08 + (settings.inflate ?? 100) * 0.0092;
        const bounds = arrangeProduct(
          root,
          prototype,
          layout.id,
          settings.spacing || 1,
          depth,
        );
        const center = bounds.getCenter(new THREE.Vector3());
        camera.position
          .copy(center)
          .addScaledVector(
            direction,
            fittedDistance(bounds, camera, direction, 1.14),
          );
        camera.lookAt(center);
        shadow.mesh.visible = settings.shadows;
        if (settings.shadows) shadow.update(root);
        renderer.shadowMap.enabled = false;
        renderer.setRenderTarget(target);
        renderer.setViewport(0, 0, width, height);
        renderer.setScissorTest(false);
        renderer.render(scene, camera);
        renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
        for (let y = 0; y < height; y++)
          image.data.set(
            pixels.subarray(
              (height - y - 1) * width * 4,
              (height - y) * width * 4,
            ),
            y * width * 4,
          );
        ctx.putImageData(image, 0, 0);
        covers[layout.id] = output.toDataURL("image/webp", 0.88);
      } finally {
        renderer.shadowMap.enabled = shadows;
        renderer.setRenderTarget(previous);
        renderer.setViewport(viewport);
        renderer.setScissor(scissor);
        renderer.setScissorTest(scissorTest);
      }
    }
    return covers;
  } finally {
    target.dispose();
    shadow.dispose();
    root.clear(); // Geometry, materials and textures still belong to the viewer.
  }
}
