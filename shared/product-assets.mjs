import * as THREE from "three";
import { PRODUCT } from "./schema.mjs";
import { pouchSurface } from "./pouch-geometry.mjs";
import { addPouchStructure } from "./pouch-structure.mjs";

export const ASSET_REVISION = "doypack-v1-r1";

/** Export a texture-free, UV-mapped original model in glTF's metre units. */
export function createReferencePouch() {
  const root = new THREE.Group();
  root.name = ASSET_REVISION;
  root.userData = {
    modelId: PRODUCT.id,
    revision: ASSET_REVISION,
    approximate: true,
    productionReady: false,
    purpose: "visual-reference-only",
  };
  for (const face of ["front", "back"]) {
    const material = new THREE.MeshPhysicalMaterial({
      color: "#ffffff",
      roughness: 0.46,
      metalness: 0,
      clearcoat: 0.16,
      clearcoatRoughness: 0.42,
      ior: 1.46,
      side: THREE.DoubleSide,
    });
    material.name = `artwork_${face}`;
    const mesh = new THREE.Mesh(pouchSurface(face === "back"), material);
    mesh.name = `print_${face}`;
    mesh.userData = { printableFace: face, uvTop: 1, textureFlipY: true };
    root.add(mesh);
  }
  const seal = new THREE.MeshPhysicalMaterial({
    color: "#ffffff",
    roughness: 0.53,
    clearcoat: 0.1,
  });
  seal.name = "unprinted_seals";
  addPouchStructure(root, seal);
  // Preserve the existing visual shape; fit its reference width/height in metres.
  const sourceBounds = new THREE.Box3().setFromObject(root);
  const size = sourceBounds.getSize(new THREE.Vector3());
  const scale = new THREE.Matrix4().makeScale(
    PRODUCT.widthMm / 1000 / size.x,
    PRODUCT.heightMm / 1000 / size.y,
    PRODUCT.heightMm / 1000 / size.y,
  );
  root.updateMatrixWorld(true);
  root.traverse((node) => {
    if (!node.isMesh) return;
    node.geometry.applyMatrix4(
      new THREE.Matrix4().multiplyMatrices(scale, node.matrixWorld),
    );
    node.position.set(0, 0, 0);
    node.rotation.set(0, 0, 0);
    node.scale.set(1, 1, 1);
  });
  root.updateMatrixWorld(true);
  return root;
}

export function referenceAssetDefinition() {
  const sx = PRODUCT.widthMm / PRODUCT.canvasWidth;
  const sy = PRODUCT.heightMm / PRODUCT.canvasHeight;
  return {
    schemaVersion: 1,
    assetRevision: ASSET_REVISION,
    modelId: PRODUCT.id,
    title: "Beyaz Doypack · Örnek model",
    approximate: true,
    productionReady: false,
    manufacturerApproved: false,
    model: {
      file: "model.glb",
      units: "metres",
      upAxis: "+Y",
      frontAxis: "+Z",
    },
    referenceDimensionsMm: {
      width: PRODUCT.widthMm,
      height: PRODUCT.heightMm,
      depth: null,
    },
    faces: Object.fromEntries(
      ["front", "back"].map((face) => [
        face,
        {
          mesh: `print_${face}`,
          material: `artwork_${face}`,
          template: `${face}.svg`,
          canvas: { width: PRODUCT.canvasWidth, height: PRODUCT.canvasHeight },
          dimensionsMm: { width: PRODUCT.widthMm, height: PRODUCT.heightMm },
          printRectPx: PRODUCT.print,
          printRectMm: {
            x: PRODUCT.print.x * sx,
            y: PRODUCT.print.y * sy,
            width: PRODUCT.print.width * sx,
            height: PRODUCT.print.height * sy,
          },
          safeInsetPx: PRODUCT.safeInset,
          safeInsetMm: { x: PRODUCT.safeInset * sx, y: PRODUCT.safeInset * sy },
          uv: {
            channel: 0,
            left: 0,
            right: 1,
            top: 1,
            bottom: 0,
            canvasTextureFlipY: true,
          },
        },
      ]),
    ),
    production: {
      manufacturer: null,
      approvedDieline: null,
      bleedMm: null,
      cuttingPaths: null,
      foldPaths: null,
      gussetDimensionsMm: null,
      requiredDpi: null,
      colorSpace: null,
      iccProfile: null,
    },
    notes: [
      "Özgün parametrik görselleştirme; gerçek bir üretici ürününün teknik modeli değildir.",
      "140 × 210 mm örnek ön/arka yüz ölçüsüdür; derinlik ve kaynak/körük ölçüleri onaysızdır.",
      "SVG çizgileri referans kılavuzudur. Kesim ve katlama yolları tanımlı değildir.",
      "Bu JSON mevcut editörde otomatik içe alınmaz; model adaptörü için eşleme sözleşmesidir.",
    ],
  };
}

/** Exact face-size artboard, with non-production guides kept in a separate group. */
export function referenceFaceSvg(face) {
  if (!["front", "back"].includes(face)) throw new Error("Geçersiz yüz");
  const definition = referenceAssetDefinition();
  const { printRectMm: p, safeInsetMm: s } = definition.faces[face];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PRODUCT.widthMm}mm" height="${PRODUCT.heightMm}mm" viewBox="0 0 ${PRODUCT.canvasWidth} ${PRODUCT.canvasHeight}">
<title>Alaçam doypack ${face === "front" ? "ön" : "arka"} yüz — ÖRNEK, ÜRETİM ONAYSIZ</title>
<metadata>${JSON.stringify({ schemaVersion: 1, modelId: PRODUCT.id, assetRevision: ASSET_REVISION, face, productionReady: false, kind: "reference-artboard", dimensionsMm: definition.faces[face].dimensionsMm, printRectMm: p, safeInsetMm: s })}</metadata>
<g id="artwork"><rect width="600" height="900" fill="white"/></g>
<g id="reference-guides" data-production="false" fill="none" stroke-width="1.5">
<rect x="0.75" y="0.75" width="598.5" height="898.5" stroke="#202020"/>
<rect x="${PRODUCT.print.x}" y="${PRODUCT.print.y}" width="${PRODUCT.print.width}" height="${PRODUCT.print.height}" stroke="#8050d5" stroke-dasharray="8 4"/>
<rect x="${PRODUCT.print.x + PRODUCT.safeInset}" y="${PRODUCT.print.y + PRODUCT.safeInset}" width="${PRODUCT.print.width - 2 * PRODUCT.safeInset}" height="${PRODUCT.print.height - 2 * PRODUCT.safeInset}" stroke="#288766" stroke-dasharray="4 4"/>
<text x="300" y="875" text-anchor="middle" fill="#333" stroke="none" font-family="Arial, sans-serif" font-size="13">ÖRNEK ŞABLON · ÜRETİM ONAYSIZ</text>
</g></svg>`;
}
