import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  ASSET_REVISION,
  referenceAssetDefinition,
} from "../shared/product-assets.mjs";

const directory = new URL(
  `../public/product-assets/${ASSET_REVISION}/`,
  import.meta.url,
);

test("standalone GLB loads with the production Three.js loader and retains named printable UV faces", async () => {
  const data = await readFile(new URL("model.glb", directory));
  assert.equal(data.readUInt32LE(0), 0x46546c67);
  assert.equal(data.readUInt32LE(4), 2);
  assert.equal(data.readUInt32LE(8), data.length);
  assert.ok(
    data.length < 1_000_000,
    "mobile asset must stay below the reference budget",
  );
  const buffer = data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength,
  );
  const { scene } = await new GLTFLoader().parseAsync(buffer, "");
  const definition = referenceAssetDefinition();
  const bounds = new THREE.Box3().setFromObject(scene);
  const size = bounds.getSize(new THREE.Vector3());
  assert.ok(Math.abs(size.x - 0.14) < 0.000001);
  assert.ok(Math.abs(size.y - 0.21) < 0.000001);
  assert.ok(scene.getObjectByName(ASSET_REVISION).userData.approximate);
  assert.equal(
    scene.getObjectByName(ASSET_REVISION).userData.productionReady,
    false,
  );
  for (const [face, spec] of Object.entries(definition.faces)) {
    const mesh = scene.getObjectByName(spec.mesh);
    assert.ok(mesh?.isMesh);
    assert.equal(mesh.material.name, spec.material);
    assert.equal(mesh.userData.printableFace, face);
    const uv = mesh.geometry.getAttribute("uv");
    const positions = mesh.geometry.getAttribute("position");
    const normals = mesh.geometry.getAttribute("normal");
    assert.equal(uv.count, positions.count);
    for (let i = 0; i < uv.count; i++) {
      assert.ok(uv.getX(i) >= 0 && uv.getX(i) <= 1);
      assert.ok(uv.getY(i) >= 0 && uv.getY(i) <= 1);
      assert.ok(Number.isFinite(positions.getZ(i)));
    }
    assert.ok(
      positions.getY(uv.count - 1) > positions.getY(0),
      "UV top must align with physical top",
    );
    const center = Math.floor(positions.count / 2);
    assert.ok(
      face === "front" ? normals.getZ(center) > 0 : normals.getZ(center) < 0,
    );
  }
  const closure = scene.getObjectByName("bottom_gusset");
  assert.ok(closure?.isMesh);
  const closureBounds = new THREE.Box3().setFromObject(closure);
  let lowerEdgeDepth = 0;
  for (const face of ["front", "back"]) {
    const mesh = scene.getObjectByName(definition.faces[face].mesh);
    const uv = mesh.geometry.getAttribute("uv");
    const positions = mesh.geometry.getAttribute("position");
    for (let i = 0; i < uv.count; i++) {
      if (uv.getY(i) > 0.016) continue;
      const point = new THREE.Vector3()
        .fromBufferAttribute(positions, i)
        .applyMatrix4(mesh.matrixWorld);
      lowerEdgeDepth = Math.max(lowerEdgeDepth, Math.abs(point.z));
    }
  }
  assert.ok(
    Math.max(Math.abs(closureBounds.min.z), Math.abs(closureBounds.max.z)) <=
      lowerEdgeDepth,
    "bottom closure must remain inside the sealed edge instead of protruding as a white shelf",
  );
  scene.traverse((node) => {
    if (!node.isMesh) return;
    node.geometry.dispose();
    node.material.dispose();
  });
});

test("asset definition and face artboards agree on scale, clipping and non-production status", async () => {
  const definition = JSON.parse(
    await readFile(new URL("definition.json", directory), "utf8"),
  );
  assert.deepEqual(definition, referenceAssetDefinition());
  assert.equal(definition.productionReady, false);
  assert.equal(definition.production.cuttingPaths, null);
  assert.equal(definition.production.bleedMm, null);
  for (const [face, spec] of Object.entries(definition.faces)) {
    const svg = await readFile(new URL(spec.template, directory), "utf8");
    assert.match(svg, /width="140mm" height="210mm" viewBox="0 0 600 900"/);
    assert.match(svg, /"productionReady":false/);
    assert.ok(svg.includes(`"face":"${face}"`));
    assert.match(svg, /id="reference-guides" data-production="false"/);
    assert.doesNotMatch(svg, /<script|href=|onload=/i);
    assert.ok(
      Math.abs(spec.printRectMm.width - (spec.printRectPx.width / 600) * 140) <
        1e-9,
    );
    assert.ok(
      Math.abs(
        spec.printRectMm.height - (spec.printRectPx.height / 900) * 210,
      ) < 1e-9,
    );
  }
});
