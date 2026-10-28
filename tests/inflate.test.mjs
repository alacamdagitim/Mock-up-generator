import test from "node:test";
import assert from "node:assert/strict";
import {
  blankDesign,
  parseDesign,
  presentationSchema,
} from "../shared/schema.mjs";

const legacyPresentation = {
  material: "matte",
  background: "#dfe8f6",
  backgroundStyle: "gradient",
  exposure: 1.1,
  shadows: true,
};

test("optional Inflate keeps existing version 1 designs and presentations valid", () => {
  const legacy = blankDesign();
  assert.equal(parseDesign(legacy).schemaVersion, 1);
  assert.equal(parseDesign(legacy).presentation, undefined);
  assert.deepEqual(
    presentationSchema.parse(legacyPresentation),
    legacyPresentation,
  );
  const parsed = parseDesign({ ...legacy, presentation: legacyPresentation });
  assert.equal(parsed.presentation.inflate, undefined);
  assert.deepEqual(parsed.presentation, legacyPresentation);
});

test("Inflate survives version 1 JSON roundtrip at both bounds and fractional values", () => {
  for (const inflate of [0, 50.5, 100]) {
    const design = {
      ...blankDesign(),
      presentation: { ...legacyPresentation, inflate },
    };
    const parsed = parseDesign(JSON.parse(JSON.stringify(design)));
    assert.equal(parsed.schemaVersion, 1);
    assert.equal(parsed.presentation.inflate, inflate);
    assert.deepEqual(parsed, design);
  }
});

test("Inflate rejects out of range, nonfinite and nonnumeric values", () => {
  for (const inflate of [-1, 101, NaN, Infinity, -Infinity, "50", null]) {
    const presentation = { ...legacyPresentation, inflate };
    assert.equal(presentationSchema.safeParse(presentation).success, false);
    assert.throws(() => parseDesign({ ...blankDesign(), presentation }));
  }
});
