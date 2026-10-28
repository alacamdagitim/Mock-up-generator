import test from "node:test";
import assert from "node:assert/strict";
import { LAYOUTS, layoutDefinition, layoutPoses } from "../shared/layouts.mjs";
import { referenceTemplateSvg } from "../shared/templates.mjs";
import {
  blankDesign,
  parseDesign,
  DEFAULT_PRESENTATION,
} from "../shared/schema.mjs";

test("compositions are bounded and front/back pair actually exposes opposing surfaces", () => {
  assert.equal(new Set(LAYOUTS.map((x) => x.id)).size, 11);
  assert.equal(layoutPoses("catalog").length, 4);
  assert.ok(Math.max(...layoutPoses("catalog").map((p) => p.y)) > 3.5);
  for (const layout of LAYOUTS) {
    const poses = layoutPoses(layout.id);
    assert.ok(poses.length >= 1 && poses.length <= 5);
    for (const p of poses) {
      assert.ok(Object.values(p).every(Number.isFinite));
      assert.ok(p.scale > 0 && p.scale < 1.3);
    }
  }
  const pair = layoutPoses("front-back");
  assert.ok(Math.cos(pair[0].ry) > 0.9);
  assert.ok(Math.cos(pair[1].ry) < -0.9);
  assert.equal(layoutDefinition("invalid").id, "single");
});
test("composition spacing changes spread, never product scale or rotation, and is clamped", () => {
  const before = layoutPoses("trio", 1),
    after = layoutPoses("trio", 1.5);
  assert.equal(after[0].x, before[0].x * 1.5);
  assert.equal(after[0].scale, before[0].scale);
  assert.equal(after[0].ry, before[0].ry);
  assert.deepEqual(layoutPoses("duo", 100), layoutPoses("duo", 1.6));
});
test("render and composition settings survive JSON roundtrip with strict limits", () => {
  const presentation = {
    ...DEFAULT_PRESENTATION,
    layout: "front-back",
    spacing: 1.2,
    lighting: "dramatic",
    quality: "detail",
    finishing: "gloss",
    substrate: "metallic",
    printMode: "black",
  };
  assert.deepEqual(
    parseDesign({ ...blankDesign(), presentation }).presentation,
    presentation,
  );
  for (const invalid of [
    { layout: "unbounded" },
    { spacing: 5 },
    { quality: "unknown" },
    { finishing: "unknown" },
    { substrate: "remote-hdri" },
    { printMode: "unsupported" },
    { lighting: "remote-hdri" },
  ])
    assert.throws(() =>
      parseDesign({
        ...blankDesign(),
        presentation: { ...presentation, ...invalid },
      }),
    );
});
test("vector guide has physical sample dimensions and explicit non-production metadata", () => {
  const svg = referenceTemplateSvg();
  assert.match(svg, /width="318mm"/);
  assert.equal((svg.match(/width="140" height="210"/g) || []).length, 2);
  assert.match(svg, /"productionReady":false/);
  assert.match(svg, /ÜRETİM ONAYSIZ/);
  assert.doesNotMatch(svg, /<script|<image|href=|onload=/i);
  const front = referenceTemplateSvg({
    face: "front",
    print: false,
    safe: false,
  });
  assert.match(front, /width="164mm"/);
  assert.doesNotMatch(front, /stroke-dasharray/);
  assert.throws(() => referenceTemplateSvg({ face: "<script>" }));
});
