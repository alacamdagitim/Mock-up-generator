import * as THREE from "three";

export type PrintTargetFace = "front" | "back";
export type PrintTargetAxis = "x" | "y" | "z";
type Triplet = [number, number, number];
type Range = { start: number; count: number };
type TriangleSample = { area: number; normal: Triplet; center: Triplet };

export type PrintTargetUvStats = {
  present: boolean;
  usable: boolean;
  min: [number, number];
  max: [number, number];
  span: [number, number];
  finiteRatio: number;
  inUnitRangeRatio: number;
  nonDegenerateRatio: number;
  /** Summed UV triangle area divided by its bounding rectangle; >1 suggests overlap. */
  coverage: number;
  /** Conservative check for a full normalized label/wrap, not an arbitrary atlas island. */
  fullRectangle: boolean;
};

export type PrintTargetCylindricalStats = {
  feasible: boolean;
  /** Axis in the mesh geometry's local coordinates, suitable for UV generation. */
  axis: PrintTargetAxis;
  sideAreaRatio: number;
  radialAlignment: number;
  angularCoverage: number;
  radialRatio: number;
};

export type PrintTargetCandidate = {
  /** Relative child-index path plus material slot; never a random Three UUID. */
  id: string;
  meshPath: string;
  mesh: THREE.Mesh;
  material: THREE.Material;
  materialIndex: number;
  meshName: string;
  materialName: string;
  label: string;
  triangleCount: number;
  sampledTriangles: number;
  sampled: boolean;
  /** Estimated world-space area when sampling is necessary. */
  surfaceArea: number;
  bounds: { min: Triplet; max: Triplet; size: Triplet };
  uv: PrintTargetUvStats;
  cylindrical: PrintTargetCylindricalStats;
  materialSupported: boolean;
  selectable: boolean;
  explicitFace?: PrintTargetFace;
  suggestedFace: PrintTargetFace;
  confidence: "explicit" | "strong" | "possible" | "unlikely";
  score: number;
  excludedByName: boolean;
  reasons: string[];
};

export type PrintTargetAnalysis = {
  targets: PrintTargetCandidate[];
  automatic: { targetId: string; face: PrintTargetFace; reason: string }[];
  requiresSelection: boolean;
  warnings: string[];
};

const MAX_SAMPLES = 4096;
const coordinateAxes: PrintTargetAxis[] = ["x", "y", "z"];
const vectorTuple = (vector: THREE.Vector3): Triplet => [
  vector.x,
  vector.y,
  vector.z,
];
const safeName = (value: unknown) =>
  typeof value === "string" ? value.trim().slice(0, 180) : "";

function normalizedName(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .toLowerCase()
    .replace(/(?:[._-](?:primitive|mesh))?[._-]\d+$/g, "")
    .replace(/[^a-z0-9\u3400-\u9fff]+/g, " ")
    .trim();
}

function metadataFace(value: unknown): PrintTargetFace | undefined {
  if (typeof value !== "string") return undefined;
  const face = normalizedName(value);
  if (["front", "on", "on yuz"].includes(face)) return "front";
  if (["back", "arka", "arka yuz"].includes(face)) return "back";
}

function namedFace(value: string): PrintTargetFace | undefined {
  const name = normalizedName(value);
  const tokens = name.split(" ").filter(Boolean);
  const hasPrint = tokens.some((token) =>
    [
      "print",
      "printed",
      "printable",
      "artwork",
      "label",
      "baski",
      "etiket",
      "tasarim",
    ].includes(token),
  );
  if (!hasPrint || tokens.length > 5) return undefined;
  const front = tokens.some((token) => ["front", "on"].includes(token));
  const back = tokens.some((token) => ["back", "arka"].includes(token));
  return front === back ? undefined : front ? "front" : "back";
}

function semantics(mesh: THREE.Mesh, material: THREE.Material) {
  const meshName = safeName(mesh.name),
    materialName = safeName(material.name);
  const name = normalizedName(`${meshName} ${materialName}`);
  const tokens = new Set(name.split(" ").filter(Boolean));
  const contains = (words: string[]) => words.some((word) => tokens.has(word));
  const label =
    contains([
      "label",
      "artwork",
      "print",
      "printed",
      "printable",
      "graphic",
      "graphics",
      "design",
      "decal",
      "wrap",
      "sleeve",
      "etiket",
      "baski",
      "tasarim",
    ]) || /贴图|标签|印刷/.test(name);
  const body =
    contains([
      "body",
      "main",
      "container",
      "can",
      "canbody",
      "bottle",
      "cup",
      "pouch",
      "doypack",
      "bag",
      "govde",
      "ana",
      "urun",
    ]) || /主体|罐身|瓶身|杯身/.test(name);
  const excluded =
    contains([
      "lid",
      "cap",
      "top",
      "bottom",
      "inside",
      "inner",
      "interior",
      "base",
      "closure",
      "zipper",
      "seal",
      "ring",
      "tab",
      "pulltab",
      "handle",
      "kapak",
      "alt",
      "taban",
      "ic",
      "kulp",
      "agiz",
      "fill",
      "filling",
      "liquid",
      "contents",
      "dolgu",
      "icerik",
      "sivi",
    ]) || /盖子|瓶盖|底部|内侧|拉环|填充物/.test(name);
  const explicitFace =
    metadataFace(mesh.userData.printableFace) ||
    namedFace(meshName) ||
    metadataFace(material.userData.printableFace) ||
    namedFace(materialName);
  const suggestedFace =
    explicitFace || (contains(["back", "arka"]) ? "back" : "front");
  return {
    label,
    body,
    excluded,
    explicitFace,
    suggestedFace: suggestedFace as PrintTargetFace,
  };
}

function materialRanges(mesh: THREE.Mesh) {
  const geometry = mesh.geometry;
  const count =
    geometry.index?.count ?? geometry.getAttribute("position")?.count ?? 0;
  const drawStart = Math.max(0, geometry.drawRange.start);
  const drawEnd = Math.min(count, drawStart + geometry.drawRange.count);
  const ranges = new Map<number, Range[]>();
  const add = (slot: number, start: number, end: number) => {
    const first = Math.max(start, drawStart),
      last = Math.min(end, drawEnd);
    if (last - first < 3) return;
    const entries = ranges.get(slot) || [];
    entries.push({ start: first, count: Math.floor((last - first) / 3) * 3 });
    ranges.set(slot, entries);
  };
  if (!Array.isArray(mesh.material)) add(0, 0, count);
  else
    for (const group of geometry.groups) {
      const slot = group.materialIndex || 0;
      if (mesh.material[slot])
        add(slot, group.start, group.start + group.count);
    }
  return ranges;
}

function cylindricalStats(
  samples: TriangleSample[],
  bounds: THREE.Box3,
): PrintTargetCylindricalStats {
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const totalArea = samples.reduce((sum, sample) => sum + sample.area, 0);
  let best: PrintTargetCylindricalStats = {
    feasible: false,
    axis: "y",
    sideAreaRatio: 0,
    radialAlignment: 0,
    angularCoverage: 0,
    radialRatio: 0,
  };
  let bestScore = 0;
  if (samples.length < 8 || !totalArea || bounds.isEmpty()) return best;
  for (let axis = 0; axis < 3; axis++) {
    const u = (axis + 1) % 3,
      v = (axis + 2) % 3;
    const radiusU = size.getComponent(u) / 2,
      radiusV = size.getComponent(v) / 2;
    const radialRatio = Math.min(radiusU, radiusV) / Math.max(radiusU, radiusV);
    if (
      !Number.isFinite(radialRatio) ||
      radialRatio < 0.55 ||
      size.getComponent(axis) < 1e-8
    )
      continue;
    let sideArea = 0,
      alignment = 0;
    const angularBins = new Set<number>();
    for (const sample of samples) {
      if (Math.abs(sample.normal[axis]) > 0.35) continue;
      const du = (sample.center[u] - center.getComponent(u)) / radiusU;
      const dv = (sample.center[v] - center.getComponent(v)) / radiusV;
      const length = Math.hypot(du, dv);
      const normalLength = Math.hypot(sample.normal[u], sample.normal[v]);
      if (length < 0.2 || !normalLength) continue;
      const radialNormal = Math.abs(
        (du * sample.normal[u] + dv * sample.normal[v]) /
          (length * normalLength),
      );
      sideArea += sample.area;
      alignment += radialNormal * sample.area;
      if (radialNormal > 0.65)
        angularBins.add(
          Math.floor(((Math.atan2(dv, du) + Math.PI) / (Math.PI * 2)) * 12) %
            12,
        );
    }
    const sideAreaRatio = sideArea / totalArea;
    const radialAlignment = sideArea ? alignment / sideArea : 0;
    const angularCoverage = angularBins.size / 12;
    const feasible =
      sideAreaRatio >= 0.55 && radialAlignment >= 0.8 && angularCoverage >= 0.5;
    const score = sideAreaRatio * radialAlignment * angularCoverage;
    if (score > bestScore) {
      bestScore = score;
      best = {
        feasible,
        axis: coordinateAxes[axis],
        sideAreaRatio,
        radialAlignment,
        angularCoverage,
        radialRatio,
      };
    }
  }
  return best;
}

function inspectCandidate(
  mesh: THREE.Mesh,
  path: string,
  slot: number,
  material: THREE.Material,
  ranges: Range[],
): PrintTargetCandidate {
  const position = mesh.geometry.getAttribute("position");
  const uv = mesh.geometry.getAttribute("uv");
  const index = mesh.geometry.index;
  const triangleCount = ranges.reduce((sum, range) => sum + range.count / 3, 0);
  const stride = Math.max(1, Math.ceil(triangleCount / MAX_SAMPLES));
  const worldBounds = new THREE.Box3(),
    localBounds = new THREE.Box3();
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  const worldA = new THREE.Vector3(),
    worldB = new THREE.Vector3(),
    worldC = new THREE.Vector3();
  const ab = new THREE.Vector3(),
    ac = new THREE.Vector3(),
    normal = new THREE.Vector3();
  const samples: TriangleSample[] = [];
  let sampledTriangles = 0,
    validUvPoints = 0,
    unitUvPoints = 0;
  let validUvTriangles = 0,
    spatialTriangles = 0,
    uvArea = 0,
    surfaceArea = 0;
  let minU = Infinity,
    minV = Infinity,
    maxU = -Infinity,
    maxV = -Infinity;
  let triangleOrdinal = 0;
  if (position)
    for (const range of ranges)
      for (
        let offset = range.start;
        offset + 2 < range.start + range.count;
        offset += 3
      ) {
        if (triangleOrdinal++ % stride) continue;
        const indices = [0, 1, 2].map((corner) =>
          index ? index.getX(offset + corner) : offset + corner,
        );
        if (indices.some((vertex) => vertex < 0 || vertex >= position.count))
          continue;
        a.fromBufferAttribute(position, indices[0]);
        b.fromBufferAttribute(position, indices[1]);
        c.fromBufferAttribute(position, indices[2]);
        if (
          ![a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z].every(Number.isFinite)
        )
          continue;
        sampledTriangles++;
        localBounds.expandByPoint(a).expandByPoint(b).expandByPoint(c);
        worldA.copy(a).applyMatrix4(mesh.matrixWorld);
        worldB.copy(b).applyMatrix4(mesh.matrixWorld);
        worldC.copy(c).applyMatrix4(mesh.matrixWorld);
        worldBounds
          .expandByPoint(worldA)
          .expandByPoint(worldB)
          .expandByPoint(worldC);
        const area =
          ab
            .subVectors(worldB, worldA)
            .cross(ac.subVectors(worldC, worldA))
            .length() / 2;
        if (!Number.isFinite(area) || area <= 1e-14) continue;
        spatialTriangles++;
        surfaceArea += area * stride;
        normal
          .crossVectors(ab.subVectors(b, a), ac.subVectors(c, a))
          .normalize();
        samples.push({
          area,
          normal: vectorTuple(normal),
          center: [
            (a.x + b.x + c.x) / 3,
            (a.y + b.y + c.y) / 3,
            (a.z + b.z + c.z) / 3,
          ],
        });
        if (!uv || indices.some((vertex) => vertex >= uv.count)) continue;
        const points = indices.map((vertex) => [
          uv.getX(vertex),
          uv.getY(vertex),
        ]);
        for (const [u, v] of points)
          if (Number.isFinite(u) && Number.isFinite(v)) {
            validUvPoints++;
            minU = Math.min(minU, u);
            minV = Math.min(minV, v);
            maxU = Math.max(maxU, u);
            maxV = Math.max(maxV, v);
            if (u >= -0.001 && u <= 1.001 && v >= -0.001 && v <= 1.001)
              unitUvPoints++;
          }
        if (!points.flat().every(Number.isFinite)) continue;
        const areaUv =
          Math.abs(
            (points[1][0] - points[0][0]) * (points[2][1] - points[0][1]) -
              (points[2][0] - points[0][0]) * (points[1][1] - points[0][1]),
          ) / 2;
        if (areaUv > 1e-12) validUvTriangles++;
        uvArea += areaUv * stride;
      }
  const spanU = Number.isFinite(minU) ? maxU - minU : 0;
  const spanV = Number.isFinite(minV) ? maxV - minV : 0;
  const finiteRatio = spatialTriangles
    ? validUvPoints / (spatialTriangles * 3)
    : 0;
  const inUnitRangeRatio = validUvPoints ? unitUvPoints / validUvPoints : 0;
  const nonDegenerateRatio = spatialTriangles
    ? validUvTriangles / spatialTriangles
    : 0;
  const coverage = spanU > 1e-8 && spanV > 1e-8 ? uvArea / (spanU * spanV) : 0;
  const usable =
    !!uv &&
    finiteRatio >= 0.999 &&
    nonDegenerateRatio >= 0.9 &&
    spanU > 1e-5 &&
    spanV > 1e-5;
  const fullRectangle =
    usable &&
    inUnitRangeRatio >= 0.99 &&
    spanU >= 0.8 &&
    spanV >= 0.8 &&
    coverage >= 0.65 &&
    coverage <= 1.35;
  const cylindrical = cylindricalStats(samples, localBounds);
  const meaning = semantics(mesh, material);
  const materialSupported = material instanceof THREE.MeshStandardMaterial;
  const reasons: string[] = [];
  if (meaning.explicitFace) reasons.push("Modelde baskı yüzü açıkça tanımlı.");
  else if (meaning.label)
    reasons.push("Adı etiket, sarım veya baskı yüzeyini işaret ediyor.");
  else if (meaning.body)
    reasons.push("Adı ürün gövdesini işaret ediyor; baskı yüzü doğrulanmalı.");
  else reasons.push("Yüzey adı baskı alanını belirtmiyor.");
  if (meaning.excluded && !meaning.explicitFace)
    reasons.push(
      "Adı kapak, iç yüzey, taban, dolgu veya aksesuarı işaret ediyor.",
    );
  if (!uv) reasons.push("UV koordinatı yok.");
  else if (!usable)
    reasons.push(
      "UV koordinatları eksik, bozuk veya üçgenlerin üzerinde sıfır alanlı.",
    );
  else if (!fullRectangle)
    reasons.push(
      "UV, tam bir 0–1 sarım alanı gibi görünmüyor; desenin yerleşimini kontrol et.",
    );
  if (coverage > 1.35) reasons.push("UV adaları üst üste geliyor olabilir.");
  if (cylindrical.feasible)
    reasons.push(
      "Silindirik gövde geometrisi algılandı; mevcut UV yerleşimini 3B görünümde kontrol edin.",
    );
  if (!materialSupported)
    reasons.push("Malzeme fiziksel baskı önizlemesi için uygun değil.");
  const confidence = meaning.explicitFace
    ? "explicit"
    : meaning.label && !meaning.excluded && fullRectangle
      ? "strong"
      : !meaning.excluded && (meaning.body || cylindrical.feasible)
        ? "possible"
        : "unlikely";
  const score =
    confidence === "explicit"
      ? 100
      : confidence === "strong"
        ? 80
        : meaning.excluded
          ? 0
          : meaning.body
            ? 50
            : cylindrical.feasible
              ? 40
              : usable
                ? 15
                : 5;
  const min = worldBounds.isEmpty()
    ? ([0, 0, 0] as Triplet)
    : vectorTuple(worldBounds.min);
  const max = worldBounds.isEmpty()
    ? ([0, 0, 0] as Triplet)
    : vectorTuple(worldBounds.max);
  const size = worldBounds.isEmpty()
    ? ([0, 0, 0] as Triplet)
    : vectorTuple(worldBounds.getSize(new THREE.Vector3()));
  const meshName = safeName(mesh.name),
    materialName = safeName(material.name);
  return {
    id: `${path || "root"}:${slot}`,
    meshPath: path || "root",
    mesh,
    material,
    materialIndex: slot,
    meshName,
    materialName,
    label: [meshName || "Adsız yüzey", materialName]
      .filter(Boolean)
      .join(" · "),
    triangleCount,
    sampledTriangles,
    sampled: stride > 1,
    surfaceArea,
    bounds: { min, max, size },
    uv: {
      present: !!uv,
      usable,
      min: [Number.isFinite(minU) ? minU : 0, Number.isFinite(minV) ? minV : 0],
      max: [Number.isFinite(maxU) ? maxU : 0, Number.isFinite(maxV) ? maxV : 0],
      span: [spanU, spanV],
      finiteRatio,
      inUnitRangeRatio,
      nonDegenerateRatio,
      coverage,
      fullRectangle,
    },
    cylindrical,
    materialSupported,
    selectable:
      materialSupported &&
      sampledTriangles > 0 &&
      (usable || cylindrical.feasible),
    explicitFace: meaning.explicitFace,
    suggestedFace: meaning.suggestedFace,
    confidence,
    score,
    excludedByName: meaning.excluded,
    reasons,
  };
}

/**
 * Inspect source meshes before arranging layout clones. No materials, geometry,
 * names or metadata are changed. IDs survive reloads and source-root clones;
 * callers can copy these IDs into clone metadata when arranging a scene.
 *
 * Geometry/name heuristics suggest targets; only explicit definitions or one
 * unambiguous full-UV label are safe enough for automatic assignment.
 */
export function analyzePrintTargets(root: THREE.Object3D): PrintTargetAnalysis {
  root.updateWorldMatrix(true, true);
  const targets: PrintTargetCandidate[] = [];
  const visit = (node: THREE.Object3D, path: string) => {
    if (!node.visible) return;
    if (node instanceof THREE.Mesh && !(node instanceof THREE.SkinnedMesh)) {
      const materials = Array.isArray(node.material)
        ? node.material
        : [node.material];
      for (const [slot, ranges] of materialRanges(node)) {
        const material = materials[slot];
        if (material?.visible)
          targets.push(inspectCandidate(node, path, slot, material, ranges));
      }
    }
    node.children.forEach((child, index) =>
      visit(child, path ? `${path}/${index}` : String(index)),
    );
  };
  visit(root, "");
  const automatic = targets
    .filter(
      (target) =>
        target.explicitFace && target.materialSupported && target.uv.usable,
    )
    .map((target) => ({
      targetId: target.id,
      face: target.explicitFace!,
      reason: "Modelde tanımlı baskı yüzü",
    }));
  const labels = targets.filter(
    (target) =>
      target.confidence === "strong" &&
      target.materialSupported &&
      target.uv.usable,
  );
  if (!automatic.length && labels.length === 1)
    automatic.push({
      targetId: labels[0].id,
      face: labels[0].suggestedFace,
      reason: "Tek ve açıkça adlandırılmış, tam UV alanlı baskı yüzeyi",
    });
  const warnings: string[] = [];
  if (!targets.length)
    warnings.push("Analiz edilebilen sabit model yüzeyi bulunamadı.");
  if (!automatic.length && targets.length)
    warnings.push(
      "Baskı yüzeyi güvenle seçilemedi. Gövde veya etiket yüzeyini seçip tasarımın yerleşimini onayla.",
    );
  if (!automatic.length && labels.length > 1)
    warnings.push(
      "Birden fazla etiket yüzeyi var; tasarımın uygulanacağı yüzeyi seç.",
    );
  if (targets.some((target) => target.explicitFace && !target.uv.usable))
    warnings.push(
      "Baskı yüzü işaretli bazı parçaların UV koordinatları kullanılamıyor.",
    );
  if (
    targets.some((target) => !target.uv.usable && target.cylindrical.feasible)
  )
    warnings.push(
      "Bazı gövdelerde UV eksik veya bozuk. Silindirik sarım önizlemesi oluşturulabilir; bıçak iziyle doğrulanmış eşleme değildir.",
    );
  return { targets, automatic, requiresSelection: !automatic.length, warnings };
}
