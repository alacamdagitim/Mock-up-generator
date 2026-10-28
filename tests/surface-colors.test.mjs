import test from "node:test";
import assert from "node:assert/strict";
import { blankDesign, parseDesign } from "../shared/schema.mjs";
import {
  faceBackground,
  withSurfaceColor,
  normalizeHex,
  hexToHsv,
  hsvToHex,
  recommendedSurfaceColors,
} from "../shared/surface-colors.mjs";

test("legacy JSON keeps its global color on both faces without migration", () => {
  const design = { ...blankDesign(), background: "#aaccee" };
  const parsed = parseDesign(JSON.parse(JSON.stringify(design)));
  assert.equal(parsed.surfaceColors, undefined);
  assert.equal(faceBackground(parsed, "front"), "#aaccee");
  assert.equal(faceBackground(parsed, "back"), "#aaccee");
});

test("surface overrides roundtrip without changing the opposite face or old global fallback", () => {
  const original = { ...blankDesign(), background: "#aaccee" };
  const front = withSurfaceColor(original, "front", "#a3c83e");
  assert.equal(faceBackground(front, "front"), "#a3c83e");
  assert.equal(faceBackground(front, "back"), "#aaccee");
  assert.equal(front.background, original.background);
  assert.equal(original.surfaceColors, undefined);
  const both = parseDesign(
    JSON.parse(JSON.stringify(withSurfaceColor(front, "back", "#123456"))),
  );
  assert.equal(both.schemaVersion, 1);
  assert.deepEqual(both.surfaceColors, { front: "#a3c83e", back: "#123456" });
  // History stores the immutable old object; undo restores that face's color.
  assert.equal(faceBackground(front, "back"), "#aaccee");
});

test("unsafe surface colors and unknown faces are rejected by strict server schema", () => {
  for (const surfaceColors of [
    { front: "url(https://example.com)" },
    { front: "#ff00" },
    { back: "transparent" },
    { side: "#ffffff" },
    { front: null },
    { front: 123 },
  ])
    assert.throws(() => parseDesign({ ...blankDesign(), surfaceColors }));
});

test("color entry normalizes valid HEX and rejects executable or unsupported values", () => {
  assert.equal(normalizeHex(" #AbC "), "#aabbcc");
  assert.equal(normalizeHex("12EF67"), "#12ef67");
  for (const invalid of [
    "",
    "red",
    "transparent",
    "#12",
    "#12345g",
    "#ffffff00",
    "url(x)",
  ])
    assert.equal(normalizeHex(invalid), null);
});

test("HSV conversions preserve every RGB channel to one byte and cover greyscale", () => {
  for (let r = 0; r <= 255; r += 17)
    for (let g = 0; g <= 255; g += 17)
      for (let b = 0; b <= 255; b += 17) {
        const hex = `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
        assert.equal(hsvToHex(hexToHsv(hex)), hex);
      }
  assert.equal(hsvToHex({ h: -120, s: 100, v: 100 }), "#0000ff");
  assert.equal(hsvToHex({ h: 1000, s: 150, v: -10 }), "#000000");
});

test("recommended colors use the current face artwork and stay bounded", () => {
  const design = {
    ...blankDesign(),
    surfaceColors: { front: "#a3c83e" },
    faces: {
      front: [
        { kind: "rect", fill: "#a3c83e" },
        { kind: "text", fill: "#123456" },
        { kind: "image", fill: "#ffaa00" },
      ],
      back: [{ kind: "rect", fill: "#f0aabb" }],
    },
  };
  const colors = recommendedSurfaceColors(design, "front");
  assert.equal(colors[0], "#a3c83e");
  assert.equal(colors.filter((color) => color === "#a3c83e").length, 1);
  assert(colors.includes("#123456"));
  assert(!colors.includes("#f0aabb"));
  assert(!colors.includes("#ffaa00"));
  assert(colors.length <= 6);
});
