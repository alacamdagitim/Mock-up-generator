import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { inspectGlb, MAX_MODEL_BYTES } from "../shared/model-file.mjs";
import type { createPouchAsset } from "./pouchAsset";
import { analyzePrintTargets } from "./printTargets";
import type { ModelBinding } from "./types";

export type PrintSurfaceOption = {
  id: string;
  label: string;
  usable: boolean;
  recommended: boolean;
  reasons: string[];
};

export type PreviewAsset = ReturnType<typeof createPouchAsset> & {
  external?: boolean;
  mappedFaces?: string[];
  surfaceOptions?: PrintSurfaceOption[];
  selectedSurface?: string;
  mappingWarning?: string;
  materialProfile?: string;
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
    const isAluminumCan =
      model.getObjectByName("拉环") && model.getObjectByName("瓶盖");
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
        const isLabel = /贴图|label|artwork|sleeve|wrap/i.test(node.name);
        const isMetal = Boolean(
          isAluminumCan &&
          !isLabel &&
          !/填充物|filling|liquid/i.test(node.name),
        );
        const material = new THREE.MeshPhysicalMaterial({
          color: isMetal ? "#bdc2ca" : "#ffffff",
          metalness: isMetal ? 1 : 0,
          roughness: isMetal ? 0.3 : 0.54,
          clearcoat: isAluminumCan && isLabel ? 0.12 : 0,
          clearcoatRoughness: 0.38,
          // Follow glTF's default winding when the file omits materials.
          side: THREE.FrontSide,
        });
        node.material = material;
        node.userData.alacamGeneratedMaterial = true;
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
    if (!definition.materials?.length)
      prototype.userData.alacamMaterialProfile = isAluminumCan
        ? "metal-can"
        : "neutral";
    return prototype;
  } catch (error) {
    disposeModel(model);
    throw error;
  }
}

/** Bind explicit/full-UV labels, or a surface selected for this particular model. */
export function createImportedAsset(
  prototype: THREE.Group,
  renderer: THREE.WebGLRenderer,
  binding?: Pick<ModelBinding, "targetId" | "flipY">,
): PreviewAsset {
  const maps = ["front", "back"].map(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 600;
    canvas.height = 900;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = false; // glTF UV convention
    texture.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
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
  const analysis = analyzePrintTargets(prototype);
  // Record the actual per-slot binding, including an empty map for unprinted
  // imported meshes. Offline snapshots must not infer a different assignment
  // from authored names after the user chooses one particular surface.
  prototype.traverse((node) => {
    if (node instanceof THREE.Mesh) node.userData.alacamPrintBindings = {};
  });
  const selected =
    binding &&
    analysis.targets.find(
      (target) =>
        target.id === binding.targetId &&
        target.materialSupported &&
        target.uv.usable,
    );
  const assignments = selected
    ? [{ targetId: selected.id, face: "front" as const }]
    : analysis.automatic;
  for (const assignment of assignments) {
    const target = analysis.targets.find(
      (item) => item.id === assignment.targetId,
    )!;
    const material = target.material;
    if (!(material instanceof THREE.MeshStandardMaterial)) continue;
    const copy = material.clone();
    const texture = maps[assignment.face === "front" ? 0 : 1];
    copy.map = texture;
    copy.color.set("#ffffff");
    copy.userData = { ...material.userData, printableFace: assignment.face };
    copy.needsUpdate = true;
    texture.flipY = selected
      ? binding!.flipY
      : typeof target.mesh.userData.textureFlipY === "boolean"
        ? target.mesh.userData.textureFlipY
        : false;
    if (Array.isArray(target.mesh.material)) {
      const list = [...target.mesh.material];
      list[target.materialIndex] = copy;
      target.mesh.material = list;
    } else target.mesh.material = copy;
    target.mesh.userData.alacamPrintBindings[target.materialIndex] =
      assignment.face;
    mappedFaces.add(assignment.face);
    replaced.add(material);
  }
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
    surfaceOptions: analysis.targets.map((target) => ({
      id: target.id,
      label: target.label,
      usable: target.materialSupported && target.uv.usable,
      recommended:
        target.confidence === "strong" || target.confidence === "explicit",
      reasons: target.reasons,
    })),
    selectedSurface: selected?.id || assignments[0]?.targetId,
    mappingWarning:
      binding && !selected
        ? "Kayıtlı baskı yüzeyi bu modelde bulunamadı. Otomatik eşleme kullanılıyor."
        : undefined,
    materialProfile: prototype.userData.alacamMaterialProfile,
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
