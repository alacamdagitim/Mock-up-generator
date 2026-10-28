import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import * as THREE from "three";

// Exercise the real TypeScript helper under Node without a browser/WebGL job.
const source = await readFile(
  new URL("../src/printTargets.ts", import.meta.url),
  "utf8",
);
const compiled = ts
  .transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  })
  .outputText.replace(
    'from "three"',
    `from ${JSON.stringify(import.meta.resolve("three"))}`,
  );
const { analyzePrintTargets } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

const physical = (name = "") =>
  Object.assign(new THREE.MeshPhysicalMaterial(), { name });
const mesh = (
  name,
  geometry = new THREE.PlaneGeometry(1, 1),
  material = physical(),
) => Object.assign(new THREE.Mesh(geometry, material), { name });

test("explicit per-material faces remain distinct and IDs survive source clones", () => {
  const materialFront = physical("Artwork_Front");
  const materialBack = physical("artwork_back");
  const plain = physical("Metal_Cap");
  const geometry = new THREE.BoxGeometry(1, 2, 1);
  geometry.groups.forEach((group, index) => {
    group.materialIndex = index % 3;
  });
  const body = mesh("CanBody", geometry, [materialFront, plain, materialBack]);
  const root = new THREE.Group();
  root.add(body);
  const analysis = analyzePrintTargets(root);
  assert.deepEqual(
    analysis.automatic.map((binding) => [binding.targetId, binding.face]),
    [
      ["0:0", "front"],
      ["0:2", "back"],
    ],
  );
  assert.equal(analysis.requiresSelection, false);
  assert.deepEqual(
    analyzePrintTargets(root.clone(true)).targets.map((target) => target.id),
    analysis.targets.map((target) => target.id),
  );
  assert.equal(body.geometry, geometry);
  assert.equal(body.material[0], materialFront);
  assert.equal(body.material[1], plain);
  assert.equal(body.material[2], materialBack);
  assert.equal(materialFront.map, null);
  assert.deepEqual(body.userData, {});
});

test("only one clear full-UV label can map automatically; lid and body stay separate", () => {
  const root = new THREE.Group();
  root.add(
    mesh("Product_Govde", new THREE.CylinderGeometry(1, 1, 3, 24)),
    mesh("Etiket", new THREE.PlaneGeometry(1, 1)),
    mesh("Lid_Label", new THREE.PlaneGeometry(1, 1)),
  );
  const analysis = analyzePrintTargets(root);
  assert.equal(analysis.automatic.length, 1);
  assert.equal(analysis.automatic[0].targetId, "1:0");
  const body = analysis.targets.find(
    (target) => target.meshName === "Product_Govde",
  );
  const lid = analysis.targets.find(
    (target) => target.meshName === "Lid_Label",
  );
  assert.equal(body.cylindrical.feasible, true);
  assert.equal(body.confidence, "possible");
  assert.equal(lid.excludedByName, true);
  assert.equal(lid.confidence, "unlikely");
});

test("ambiguous labels require selection instead of painting every mesh", () => {
  const root = new THREE.Group();
  root.add(mesh("LabelA"), mesh("LabelB"));
  const analysis = analyzePrintTargets(root);
  assert.equal(analysis.automatic.length, 0);
  assert.equal(analysis.requiresSelection, true);
  assert.equal(
    analysis.targets.filter((target) => target.confidence === "strong").length,
    2,
  );
  assert.ok(
    analysis.warnings.some((warning) => warning.includes("Birden fazla")),
  );
});

test("unnamed UV-less cylinders are selectable projection candidates, never silently mapped", () => {
  const geometry = new THREE.CylinderGeometry(1, 1, 3, 32);
  geometry.deleteAttribute("uv");
  const body = mesh("Object_1", geometry);
  body.rotation.x = Math.PI / 4;
  const analysis = analyzePrintTargets(body);
  const target = analysis.targets[0];
  assert.equal(analysis.requiresSelection, true);
  assert.equal(analysis.automatic.length, 0);
  assert.equal(target.uv.present, false);
  assert.equal(target.uv.usable, false);
  assert.equal(target.cylindrical.feasible, true);
  assert.equal(
    target.cylindrical.axis,
    "y",
    "projection axis is mesh-local despite world rotation",
  );
  assert.equal(target.selectable, true);
  assert.ok(
    analysis.warnings.some((warning) => warning.includes("Silindirik")),
  );
});

test("degenerate and non-finite UVs cannot become automatic print targets", () => {
  const zero = new THREE.PlaneGeometry(1, 1);
  zero.getAttribute("uv").array.fill(0);
  const malformed = new THREE.PlaneGeometry(1, 1);
  malformed.getAttribute("uv").setX(0, NaN);
  const root = new THREE.Group();
  root.add(mesh("print_front", zero), mesh("print_back", malformed));
  const analysis = analyzePrintTargets(root);
  assert.equal(analysis.automatic.length, 0);
  assert.equal(analysis.requiresSelection, true);
  assert.ok(
    analysis.targets.every((target) => !target.uv.usable && !target.selectable),
  );
  assert.ok(analysis.warnings.some((warning) => warning.includes("işaretli")));
});

test("material group bounds describe only the selected triangles in world coordinates", () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0, 10, 0, 0, 11, 0,
        0, 11, 1, 0, 10, 0, 0, 11, 1, 0, 10, 1, 0,
      ],
      3,
    ),
  );
  geometry.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(
      [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1],
      2,
    ),
  );
  geometry.addGroup(0, 6, 0);
  geometry.addGroup(6, 6, 1);
  const body = mesh("SplitBody", geometry, [
    physical("artwork_front"),
    physical("artwork_back"),
  ]);
  body.position.x = 1;
  body.scale.setScalar(2);
  const targets = analyzePrintTargets(body).targets;
  assert.deepEqual(targets[0].bounds.min, [1, 0, 0]);
  assert.deepEqual(targets[0].bounds.max, [3, 2, 0]);
  assert.deepEqual(targets[1].bounds.min, [21, 0, 0]);
  assert.deepEqual(targets[1].bounds.max, [23, 2, 0]);
  assert.equal(targets[0].surfaceArea, 4);
  assert.equal(targets[1].surfaceArea, 4);
});

test("one-million-triangle input keeps UV/geometry inspection bounded", () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3),
  );
  geometry.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2),
  );
  const index = new Uint32Array(3_000_000);
  for (let i = 0; i < index.length; i++) index[i] = i % 3;
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  const target = analyzePrintTargets(mesh("Object", geometry)).targets[0];
  assert.equal(target.triangleCount, 1_000_000);
  assert.equal(target.sampled, true);
  assert.ok(target.sampledTriangles > 0 && target.sampledTriangles <= 4096);
  assert.ok(
    target.uv.coverage > 1.35,
    "overlapping islands are reported rather than treated as a full rectangular wrap",
  );
});

test("unsupported materials and invisible material slots are not auto selectable", () => {
  const basic = mesh(
    "Label",
    new THREE.PlaneGeometry(),
    new THREE.MeshBasicMaterial(),
  );
  const basicAnalysis = analyzePrintTargets(basic);
  assert.equal(basicAnalysis.targets[0].materialSupported, false);
  assert.equal(basicAnalysis.targets[0].selectable, false);
  assert.equal(basicAnalysis.automatic.length, 0);
  const geometry = new THREE.PlaneGeometry();
  const invisible = mesh("Label", geometry, [physical("artwork_front")]);
  assert.equal(
    analyzePrintTargets(invisible).targets.length,
    0,
    "multi-material meshes without geometry groups do not render a material slot",
  );
  const hidden = mesh("artwork_front");
  hidden.visible = false;
  assert.equal(analyzePrintTargets(hidden).targets.length, 0);
  const hiddenMaterial = mesh("artwork_front");
  hiddenMaterial.material.visible = false;
  assert.equal(analyzePrintTargets(hiddenMaterial).targets.length, 0);
});

test("filling and interior component names never become implicit label targets", () => {
  for (const name of ["填充物", "Filling", "Dolgu", "İçerik"]) {
    const target = analyzePrintTargets(
      mesh(name, new THREE.PlaneGeometry(), physical("Label")),
    ).targets[0];
    assert.equal(target.excludedByName, true, name);
    assert.equal(target.confidence, "unlikely", name);
  }
});

test(
  "merchant can fixture selects only its real full-UV artwork sleeve",
  {
    skip: !process.env.ALACAM_CAN_FIXTURE,
  },
  async () => {
    const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
    const { MeshoptDecoder } =
      await import("three/addons/libs/meshopt_decoder.module.js");
    const bytes = await readFile(process.env.ALACAM_CAN_FIXTURE);
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    );
    const gltf = await new GLTFLoader()
      .setMeshoptDecoder(MeshoptDecoder)
      .parseAsync(buffer, "");
    const analysis = analyzePrintTargets(gltf.scene);
    assert.equal(analysis.requiresSelection, false);
    assert.equal(analysis.automatic.length, 1);
    const artwork = analysis.targets.find(
      (target) => target.id === analysis.automatic[0].targetId,
    );
    assert.equal(artwork.meshName, "贴图");
    assert.equal(artwork.confidence, "strong");
    assert.equal(artwork.uv.fullRectangle, true);
    assert.ok(artwork.uv.coverage > 0.95 && artwork.uv.coverage < 1.05);
    for (const name of ["拉环", "瓶盖", "填充物"]) {
      const target = analysis.targets.find(
        (target) => target.meshName === name,
      );
      assert.ok(target, `merchant component ${name} exists`);
      assert.equal(target.excludedByName, true, name);
      assert.equal(target.confidence, "unlikely", name);
      assert.ok(
        !analysis.automatic.some((binding) => binding.targetId === target.id),
        name,
      );
    }
  },
);
