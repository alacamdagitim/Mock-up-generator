import test from "node:test";
import assert from "node:assert/strict";
import {
  blankDesign,
  DEFAULT_PRESENTATION,
  parseDesign,
} from "../shared/schema.mjs";
test("selected prepared scene survives version 1 JSON export and import without embedding source assets", () => {
  const original = {
    ...blankDesign(),
    presentation: { ...DEFAULT_PRESENTATION, mockupSceneId: "cup-front-r1" },
  };
  const parsed = parseDesign(JSON.parse(JSON.stringify(original)));
  assert.equal(parsed.presentation.mockupSceneId, "cup-front-r1");
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.presentation.baseImageUrl, undefined);
  assert.equal(parseDesign(blankDesign()).presentation, undefined);
});
test("scene reference rejects URLs, paths and oversized identifiers", () => {
  for (const mockupSceneId of [
    "../source",
    "https://example.com/source.png",
    "bad id",
    "",
    "a".repeat(101),
  ])
    assert.throws(() =>
      parseDesign({
        ...blankDesign(),
        presentation: { ...DEFAULT_PRESENTATION, mockupSceneId },
      }),
    );
});
