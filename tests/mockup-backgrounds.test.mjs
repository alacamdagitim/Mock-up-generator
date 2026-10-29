import test from "node:test";
import assert from "node:assert/strict";
import {
  blankDesign,
  parseDesign,
  DEFAULT_PRESENTATION,
} from "../shared/schema.mjs";
test("per-scene background choices survive editable JSON and do not replace design surface colors", () => {
  const d = blankDesign();
  d.presentation = { ...DEFAULT_PRESENTATION };
  d.presentation.mockupBackgrounds = {
    "scene-one": "#ff88aa",
    "scene-two": "#2255cc",
  };
  const parsed = parseDesign(JSON.parse(JSON.stringify(d)));
  assert.deepEqual(
    parsed.presentation.mockupBackgrounds,
    d.presentation.mockupBackgrounds,
  );
  assert.equal(parsed.background, d.background);
});
test("background choices reject unsafe colors, scene paths and unbounded scene lists", () => {
  for (const value of [
    { scene: "red" },
    { "../file": "#ffffff" },
    Object.fromEntries(
      Array.from({ length: 65 }, (_, i) => [`scene-${i}`, "#ffffff"]),
    ),
  ]) {
    const d = blankDesign();
    d.presentation = { ...DEFAULT_PRESENTATION };
    d.presentation.mockupBackgrounds = value;
    assert.throws(() => parseDesign(d));
  }
});
