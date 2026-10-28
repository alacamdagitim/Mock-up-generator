import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { inspectGlb, MAX_MODEL_BYTES } from "../shared/model-file.mjs";
import type { createPouchAsset } from "./pouchAsset";

export type PreviewAsset = ReturnType<typeof createPouchAsset> & {
  external?: boolean;
  mappedFaces?: string[];
};
export function disposeModel(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    geometries.add(node.geometry);
    for (const material of Array.isArray(node.material)
      ? node.material
      : [node.material]) {
      materials.add(material);
      for (const value of Object.values(material))
        if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  geometries.forEach((value) => value.dispose());
  materials.forEach((value) => value.dispose());
  textures.forEach((value) => {
    value.dispose();
    if (
      typeof ImageBitmap !== "undefined" &&
      value.image instanceof ImageBitmap
    )
      value.image.close();
  });
}
export async function loadProductModel(url: string, signal: AbortSignal) {
  const response = await fetch(url, {
    signal,
    credentials: "omit",
    mode: "cors",
  });
  if (!response.ok)
    throw new Error(`GLB indirilemedi (HTTP ${response.status}).`);
  if (Number(response.headers.get("content-length")) > MAX_MODEL_BYTES)
    throw new Error("GLB en fazla 40 MB olabilir.");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("GLB dosyası okunamadı.");
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_MODEL_BYTES)
        throw new Error("GLB en fazla 40 MB olabilir.");
      chunks.push(value as Uint8Array<ArrayBuffer>);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  }
  const buffer = await new Blob(chunks).arrayBuffer();
  const definition = inspectGlb(buffer);
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.parseAsync(buffer, "");
  const model = gltf.scene;
  try {
    if (signal.aborted) throw new DOMException("İptal edildi", "AbortError");
    let meshes = 0,
      triangles = 0;
    model.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      if (node instanceof THREE.SkinnedMesh)
        throw new Error(
          "İskeletli model yerine sabit ambalaj GLB'si yükleyin.",
        );
      if (!definition.materials?.length) {
        const original = Array.isArray(node.material)
          ? node.material
          : [node.material];
        const material = new THREE.MeshPhysicalMaterial({
          color: "#ffffff",
          metalness: 0,
          roughness: 0.54,
          clearcoat: 0.08,
          side: THREE.DoubleSide,
        });
        node.material = material;
        original.forEach((item) => item.dispose());
      }
      meshes++;
      triangles +=
        (node.geometry.index?.count ||
          node.geometry.getAttribute("position")?.count ||
          0) / 3;
      for (const material of Array.isArray(node.material)
        ? node.material
        : [node.material])
        for (const value of Object.values(material))
          if (
            value instanceof THREE.Texture &&
            Math.max(value.image?.width || 0, value.image?.height || 0) > 4096
          )
            throw new Error("GLB doku boyutları en fazla 4096 px olmalı.");
      node.castShadow = true;
      node.receiveShadow = true;
    });
    if (!meshes || triangles > 1_000_000)
      throw new Error("Model boş veya bir milyon üçgen sınırını aşıyor.");
    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    const maximum = Math.max(size.x, size.y, size.z);
    if (!Number.isFinite(maximum) || maximum <= 0)
      throw new Error("Model boyutları geçersiz.");
    // View normalization only; never use this as a physical print measurement.
    const content = new THREE.Group();
    content.add(model);
    content.position
      .copy(bounds.getCenter(new THREE.Vector3()))
      .multiplyScalar(-1);
    const root = new THREE.Group();
    root.add(content);
    root.scale.setScalar(3.7 / maximum);
    const prototype = new THREE.Group();
    prototype.add(root);
    return prototype;
  } catch (error) {
    disposeModel(model);
    throw error;
  }
}

/** Bind only explicitly named UV faces. Unnamed models retain their original materials. */
export function createImportedAsset(
  prototype: THREE.Group,
  renderer: THREE.WebGLRenderer,
): PreviewAsset {
  const maps = ["front", "back"].map(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 600;
    canvas.height = 900;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = false; // glTF UV convention
    texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    return texture;
  });
  const mappedFaces = new Set<string>();
  // This merchant-provided cup has three semantic Blender parts: lid, artwork sleeve, body.
  // The sleeve's UVs span 0..1 and match the supplied 198 × 60 mm rectangular wrap.
  if (prototype.getObjectByName("盖子") && prototype.getObjectByName("主体")) {
    const sleeve = prototype.getObjectByName("贴图");
    if (sleeve instanceof THREE.Mesh) sleeve.userData.printableFace = "front";
  }
  const replaced = new Set<THREE.Material>();
  prototype.traverse((node) => {
    if (!(node instanceof THREE.Mesh) || !node.geometry.getAttribute("uv"))
      return;
    const bind = (material: THREE.Material) => {
      const face =
        node.userData.printableFace ||
        /^print_(front|back)$/.exec(node.name)?.[1] ||
        /^artwork_(front|back)$/.exec(material.name)?.[1];
      if (face !== "front" && face !== "back") return material;
      if (!(material instanceof THREE.MeshStandardMaterial)) return material;
      const copy = material.clone();
      copy.map = maps[face === "front" ? 0 : 1];
      copy.color.set("#ffffff");
      copy.needsUpdate = true;
      if (typeof node.userData.textureFlipY === "boolean")
        maps[face === "front" ? 0 : 1].flipY = node.userData.textureFlipY;
      mappedFaces.add(face);
      replaced.add(material);
      return copy;
    };
    node.material = Array.isArray(node.material)
      ? node.material.map(bind)
      : bind(node.material);
  });
  // Retain replaced source materials/textures until final disposal: materials can be shared with unprinted parts.
  const seal = new THREE.MeshPhysicalMaterial();
  const grain = new THREE.CanvasTexture(document.createElement("canvas"));
  return {
    prototype,
    maps,
    materials: [],
    seal,
    grain,
    external: true,
    mappedFaces: [...mappedFaces],
    dispose() {
      disposeModel(prototype);
      replaced.forEach((material) => {
        for (const value of Object.values(material))
          if (value instanceof THREE.Texture) value.dispose();
        material.dispose();
      });
      maps.forEach((map) => map.dispose());
      seal.dispose();
      grain.dispose();
    },
  };
}
