import * as THREE from "three";
import type { RenderOptions } from "./types";

/** Original HDR softboxes generated locally; no photographic HDRI is loaded. */
export function createStudioEnvironment(
  studio: RenderOptions["studio"],
  bounds: THREE.Box3,
  mobile: boolean,
) {
  const width = mobile ? 256 : 512,
    height = width / 2;
  const data = new Float32Array(width * height * 4);
  const dark = studio === "dramatic",
    daylight = studio === "daylight";
  const panels = [
    {
      direction: new THREE.Vector3(-1.1, 1.4, 1.2).normalize(),
      w: 0.3,
      h: 0.55,
      power: dark ? 1.6 : 1.15,
      color: new THREE.Color(daylight ? "#e4efff" : "#fff7ee"),
    },
    {
      direction: new THREE.Vector3(1.4, 0.7, 0.7).normalize(),
      w: 0.2,
      h: 0.48,
      power: dark ? 0.08 : 0.5,
      color: new THREE.Color("#ecf2ff"),
    },
    {
      direction: new THREE.Vector3(0.5, 1.2, -1.3).normalize(),
      w: 0.22,
      h: 0.45,
      power: dark ? 1.2 : 0.65,
      color: new THREE.Color("#ffffff"),
    },
  ].map((panel) => {
    const horizontal = new THREE.Vector3()
      .crossVectors(new THREE.Vector3(0, 1, 0), panel.direction)
      .normalize();
    return {
      ...panel,
      horizontal,
      vertical: new THREE.Vector3()
        .crossVectors(panel.direction, horizontal)
        .normalize(),
    };
  });
  const direction = new THREE.Vector3();
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const theta = ((y + 0.5) / height) * Math.PI,
        phi = ((x + 0.5) / width) * Math.PI * 2;
      direction.set(
        Math.sin(theta) * Math.cos(phi),
        Math.cos(theta),
        Math.sin(theta) * Math.sin(phi),
      );
      const base =
        (dark ? 0.06 : daylight ? 0.3 : 0.23) *
        (0.7 + 0.3 * Math.max(0, direction.y));
      let r = base,
        g = base,
        b = base * (daylight ? 1.08 : 1);
      for (const panel of panels) {
        const facing = direction.dot(panel.direction);
        if (facing <= 0) continue;
        const u = Math.abs(Math.atan2(direction.dot(panel.horizontal), facing));
        const v = Math.abs(Math.atan2(direction.dot(panel.vertical), facing));
        const strength =
          panel.power *
          (1 - THREE.MathUtils.smoothstep(u, panel.w * 0.84, panel.w)) *
          (1 - THREE.MathUtils.smoothstep(v, panel.h * 0.84, panel.h));
        r += panel.color.r * strength;
        g += panel.color.g * strength;
        b += panel.color.b * strength;
      }
      data.set([r, g, b, 1], (y * width + x) * 4);
    }
  const environment = new THREE.DataTexture(
    data,
    width,
    height,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  environment.mapping = THREE.EquirectangularReflectionMapping;
  environment.colorSpace = THREE.LinearSRGBColorSpace;
  environment.minFilter = environment.magFilter = THREE.LinearFilter;
  environment.generateMipmaps = false;
  environment.needsUpdate = true;
  const center = bounds.getCenter(new THREE.Vector3()),
    size = bounds.getSize(new THREE.Vector3());
  const unit = Math.max(2.8, size.x, size.y, size.z);
  const descriptions = [
    {
      position: [-0.9, 1.35, 1.1],
      width: 1.05,
      height: 1.55,
      intensity: dark ? 4.3 : 3.5,
      color: daylight ? "#eef5ff" : "#fff8ef",
    },
    {
      position: [1.15, 0.55, 0.75],
      width: 0.8,
      height: 1.25,
      intensity: dark ? 0.3 : 1.5,
      color: "#e8efff",
    },
    {
      position: [0.5, 1.05, -1.1],
      width: 0.65,
      height: 1.4,
      intensity: dark ? 4.2 : 2.8,
      color: "#ffffff",
    },
  ];
  const lights = descriptions.map((description) => {
    const light = new THREE.RectAreaLight(
      description.color,
      description.intensity,
      unit * description.width,
      unit * description.height,
    );
    light.position.set(
      ...(description.position.map(
        (n, i) => center.getComponent(i) + n * unit,
      ) as [number, number, number]),
    );
    light.lookAt(center);
    return light;
  });
  return { environment, lights };
}

/** Explicitly initialized pixels avoid the tracer's uninitialized Color cache. */
export function createStudioBackground(warm: boolean) {
  const color = new THREE.Color(warm ? "#f4ece1" : "#ffffff");
  const data = new Float32Array(4 * 2 * 4);
  for (let i = 0; i < data.length; i += 4)
    data.set([color.r, color.g, color.b, 1], i);
  const texture = new THREE.DataTexture(
    data,
    4,
    2,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.LinearSRGBColorSpace;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/** A continuous paper sweep: floor, quarter-circle and wall share one surface. */
export function createStudioBackdrop(
  bounds: THREE.Box3,
  camera: THREE.PerspectiveCamera,
  warm: boolean,
) {
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const unit = Math.max(2.8, size.x, size.y, size.z);
  center.y = bounds.min.y - 0.003;
  const toward = new THREE.Vector3(0, 0, 1).applyQuaternion(camera.quaternion);
  toward.y = 0;
  if (toward.lengthSq() < 0.0001) toward.set(0, 0, 1);
  toward.normalize();
  const right = new THREE.Vector3(toward.z, 0, -toward.x);
  const radius = unit * 2;
  const path: Array<[number, number]> = [
    [unit * 20, 0],
    [-unit, 0],
  ];
  for (let i = 1; i <= 32; i++) {
    const angle = (i / 32) * (Math.PI / 2);
    path.push([
      -unit - radius * Math.sin(angle),
      radius * (1 - Math.cos(angle)),
    ]);
  }
  path.push([-unit - radius, unit * 12]);
  const positions: number[] = [],
    indices: number[] = [];
  for (const [z, y] of path)
    for (const x of [-unit * 20, unit * 20]) {
      const p = center
        .clone()
        .addScaledVector(right, x)
        .addScaledVector(toward, z);
      positions.push(p.x, p.y + y, p.z);
    }
  for (let i = 0; i < path.length - 1; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshPhysicalMaterial({
      color: warm ? "#eee3d3" : "#f5f5f5",
      roughness: 0.72,
      metalness: 0,
      clearcoat: 0,
    }),
  );
  mesh.name = "studio_physical_cyclorama";
  // A real, broad backdrop wash keeps the paper sweep bright without making
  // it emissive. Contact shadows and bounce light still come from path tracing.
  const light = new THREE.RectAreaLight(
    warm ? "#fff6eb" : "#ffffff",
    4.5,
    unit * 5,
    unit * 3,
  );
  // Keep the wash behind the product, so it brightens the backdrop without
  // adding another broad frontal highlight that would wash out printed ink.
  light.position.copy(center).addScaledVector(toward, -unit * 1.4);
  light.position.y += unit * 3;
  light.lookAt(
    center
      .clone()
      .addScaledVector(toward, -unit * 2)
      .add(new THREE.Vector3(0, unit, 0)),
  );
  return { mesh, light };
}
