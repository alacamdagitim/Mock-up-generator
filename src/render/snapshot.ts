import * as THREE from "three";
import type { Presentation } from "../types";
import type { RenderSnapshot } from "./types";

/**
 * Freeze geometry, materials and texture pixels. A render job may outlive edits
 * or a live canvas disposal, so no live GPU resource or mutable image is shared.
 */
export function captureRenderSnapshot(
  product: THREE.Group,
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3,
  settings: Presentation,
  printTextures?: Partial<Record<"front" | "back", HTMLCanvasElement>>,
): RenderSnapshot {
  const geometries = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
  const materials = new Map<THREE.Material, THREE.Material>();
  const textures = new Map<THREE.Texture, THREE.Texture>();
  const images: HTMLCanvasElement[] = [];
  const extraTextures = new Set<THREE.Texture>();
  const extraGeometries = new Set<THREE.BufferGeometry>();
  const overrideMaps = new Map<string, THREE.Texture>();
  let filmNormal: THREE.DataTexture | null = null;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    textures.forEach((texture) => texture.dispose());
    extraTextures.forEach((texture) => texture.dispose());
    extraGeometries.forEach((geometry) => geometry.dispose());
    images.forEach((image) => {
      image.width = 1;
      image.height = 1;
    });
    geometries.clear();
    materials.clear();
    textures.clear();
    images.length = 0;
    extraTextures.clear();
    extraGeometries.clear();
    overrideMaps.clear();
  };
  const normalMap = () => {
    if (filmNormal) return filmNormal;
    const size = 128,
      heights = new Float32Array(size * size),
      pixels = new Uint8Array(size * size * 4);
    let seed = 904331;
    for (let i = 0; i < heights.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      heights[i] = seed / 0xffffffff;
    }
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const dx =
          (heights[y * size + ((x + 1) % size)] -
            heights[y * size + ((x + size - 1) % size)]) *
          0.24;
        const dy =
          (heights[((y + 1) % size) * size + x] -
            heights[((y + size - 1) % size) * size + x]) *
          0.24;
        const inverse = 1 / Math.hypot(dx, dy, 1),
          i = (y * size + x) * 4;
        pixels.set(
          [
            Math.round((0.5 - dx * inverse * 0.5) * 255),
            Math.round((0.5 - dy * inverse * 0.5) * 255),
            Math.round((0.5 + inverse * 0.5) * 255),
            255,
          ],
          i,
        );
      }
    filmNormal = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
    filmNormal.wrapS = filmNormal.wrapT = THREE.RepeatWrapping;
    filmNormal.repeat.set(5, 7);
    filmNormal.minFilter = filmNormal.magFilter = THREE.LinearFilter;
    filmNormal.needsUpdate = true;
    extraTextures.add(filmNormal);
    return filmNormal;
  };
  const overridePrint = (
    face: "front" | "back",
    material: THREE.MeshStandardMaterial,
  ) => {
    const source = printTextures?.[face];
    if (!source) return;
    let texture = overrideMaps.get(face);
    if (!texture) {
      const canvas = document.createElement("canvas");
      canvas.width = source.width;
      canvas.height = source.height;
      const context = canvas.getContext("2d");
      if (!context)
        throw new Error("Yüksek çözünürlüklü baskı dokusu hazırlanamadı.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      if (settings.printMode !== "blank") {
        context.filter =
          settings.printMode === "black" ? "grayscale(1)" : "none";
        context.drawImage(source, 0, 0);
      }
      context.getImageData(0, 0, 1, 1);
      texture = material.map?.clone() || new THREE.CanvasTexture(canvas);
      texture.source = new THREE.Source(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      images.push(canvas);
      extraTextures.add(texture);
      overrideMaps.set(face, texture);
    }
    material.map = texture;
  };
  const cloneTexture = (source: THREE.Texture): THREE.Texture => {
    const existing = textures.get(source);
    if (existing) return existing;
    const image = source.image as
      | { data?: ArrayBufferView; width?: number; height?: number }
      | CanvasImageSource
      | undefined;
    let copy: THREE.Texture;
    if (
      source instanceof THREE.DataTexture &&
      image &&
      "data" in image &&
      image.data
    ) {
      const pixels = image.data as ArrayBufferView & {
        slice: () => ArrayBufferView;
      };
      copy = source.clone();
      copy.source = new THREE.Source({ ...image, data: pixels.slice() });
    } else if (image && !Array.isArray(image)) {
      const size = image as {
        width?: number;
        height?: number;
        videoWidth?: number;
        videoHeight?: number;
        naturalWidth?: number;
        naturalHeight?: number;
      };
      const width = size.videoWidth || size.naturalWidth || size.width || 0;
      const height = size.videoHeight || size.naturalHeight || size.height || 0;
      if (!width || !height)
        throw new Error("Render dokusunun görüntü boyutları geçerli değil.");
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Render için doku kopyası oluşturulamadı.");
      context.drawImage(image as CanvasImageSource, 0, 0, width, height);
      // Reading one pixel also rejects a tainted remote texture before the job.
      context.getImageData(0, 0, 1, 1);
      images.push(canvas);
      copy = source.clone();
      copy.source = new THREE.Source(canvas);
    } else {
      throw new Error(
        "Bu doku türü bağımsız stüdyo renderında desteklenmiyor.",
      );
    }
    copy.needsUpdate = true;
    textures.set(source, copy);
    return copy;
  };
  const cloneMaterial = (source: THREE.Material) => {
    const existing = materials.get(source);
    if (existing) return existing;
    if (!(source instanceof THREE.MeshStandardMaterial))
      throw new Error(
        "Stüdyo renderı fiziksel MeshStandard/Physical malzeme gerektirir.",
      );
    const copy = source.clone();
    materials.set(source, copy);
    for (const key of Object.keys(source)) {
      if (key === "bumpMap") continue;
      const value = (source as unknown as Record<string, unknown>)[key];
      if (value instanceof THREE.Texture)
        (copy as unknown as Record<string, unknown>)[key] = cloneTexture(value);
    }
    copy.bumpMap = null;
    if (!copy.normalMap) {
      copy.normalMap = normalMap();
      copy.normalScale.setScalar(source.roughness <= 0.4 ? 0.08 : 0.14);
    }
    return copy;
  };
  try {
    const copy = product.clone(true);
    copy.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (object instanceof THREE.SkinnedMesh)
        throw new Error(
          "İskelet animasyonlu modeller henüz stüdyo renderında desteklenmiyor.",
        );
      let geometry = geometries.get(object.geometry);
      if (!geometry) {
        const clonedGeometry = object.geometry.clone() as THREE.BufferGeometry;
        geometries.set(object.geometry, clonedGeometry);
        geometry = clonedGeometry;
      }
      object.geometry = geometry;
      object.material = Array.isArray(object.material)
        ? object.material.map(cloneMaterial)
        : cloneMaterial(object.material);
      const mappedFace =
        object.userData.printableFace ||
        (object.name === "print_front"
          ? "front"
          : object.name === "print_back"
            ? "back"
            : undefined);
      if (mappedFace === "front" || mappedFace === "back") {
        const face = mappedFace;
        for (const material of Array.isArray(object.material)
          ? object.material
          : [object.material])
          if (material instanceof THREE.MeshStandardMaterial)
            overridePrint(face, material);
      }
    });
    // Close only this original pouch's unsealed perimeter in the offline copy.
    // Front/back print geometry and its UVs remain exactly as captured.
    const edgeCache = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
    const groups: THREE.Object3D[] = [];
    copy.traverse((object) => {
      if (object.children.some((child) => child.name === "print_front"))
        groups.push(object);
    });
    for (const group of groups) {
      const front = group.children.find(
        (child) => child.name === "print_front",
      );
      const back = group.children.find((child) => child.name === "print_back");
      const seal = group.children.find((child) =>
        child.name.startsWith("seal_"),
      );
      if (
        !(front instanceof THREE.Mesh) ||
        !(back instanceof THREE.Mesh) ||
        !(seal instanceof THREE.Mesh)
      )
        continue;
      const material = Array.isArray(seal.material)
        ? seal.material[0]
        : seal.material;
      let edge = edgeCache.get(front.geometry);
      if (!edge) {
        const uv = front.geometry.getAttribute("uv"),
          backUv = back.geometry.getAttribute("uv"),
          frontPosition = front.geometry.getAttribute("position"),
          backPosition = back.geometry.getAttribute("position");
        if (!uv || !backUv || !frontPosition || !backPosition) continue;
        const lookup = new Map<string, number>();
        const key = (u: number, v: number) =>
          `${Math.round(u * 100000)}:${Math.round(v * 100000)}`;
        for (let i = 0; i < backUv.count; i++)
          lookup.set(key(backUv.getX(i), backUv.getY(i)), i);
        const boundary: { index: number; order: number }[] = [];
        for (let i = 0; i < uv.count; i++) {
          const u = uv.getX(i),
            v = uv.getY(i),
            e = 0.00001;
          if (v < e) boundary.push({ index: i, order: u });
          else if (u > 1 - e) boundary.push({ index: i, order: 1 + v });
          else if (v > 1 - e) boundary.push({ index: i, order: 3 - u });
          else if (u < e) boundary.push({ index: i, order: 4 - v });
        }
        boundary.sort((a, b) => a.order - b.order);
        const vertices: number[] = [],
          texcoords: number[] = [],
          indices: number[] = [];
        for (const item of boundary) {
          const i = item.index,
            j = lookup.get(key(1 - uv.getX(i), uv.getY(i)));
          if (j === undefined) continue;
          const a = new THREE.Vector3()
            .fromBufferAttribute(frontPosition, i)
            .applyMatrix4(front.matrix);
          const b = new THREE.Vector3()
            .fromBufferAttribute(backPosition, j)
            .applyMatrix4(back.matrix);
          vertices.push(a.x, a.y, a.z, b.x, b.y, b.z);
          texcoords.push(item.order, 0, item.order, 1);
        }
        const count = vertices.length / 6;
        if (count < 4) continue;
        for (let i = 0; i < count; i++) {
          const a = i * 2,
            b = ((i + 1) % count) * 2;
          indices.push(a, a + 1, b, b, a + 1, b + 1);
        }
        edge = new THREE.BufferGeometry();
        edge.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(vertices, 3),
        );
        edge.setAttribute("uv", new THREE.Float32BufferAttribute(texcoords, 2));
        edge.setIndex(indices);
        edge.computeVertexNormals();
        extraGeometries.add(edge);
        edgeCache.set(front.geometry, edge);
      }
      const sides = new THREE.Mesh(edge, material);
      sides.name = "offline_pouch_perimeter";
      group.add(sides);
    }
    copy.updateMatrixWorld(true);
    const cameraCopy = camera.clone();
    cameraCopy.updateMatrixWorld(true);
    return {
      product: copy,
      camera: cameraCopy,
      target: target.clone(),
      settings: { ...settings },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
