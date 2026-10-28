import test from "node:test";
import assert from "node:assert/strict";
import {
  blankDesign,
  parseDesign,
  effectiveDpi,
  lineItemProperties,
} from "../shared/schema.mjs";
const el = {
  id: "00000000-0000-4000-8000-000000000001",
  kind: "image",
  name: "logo.png",
  x: 100,
  y: 200,
  width: 600,
  height: 900,
  scaleX: 1,
  scaleY: 1,
  angle: 0,
  fill: "#ffffff",
  src: "data:image/png;base64,aGVsbG8=",
  pixelWidth: 600,
  pixelHeight: 900,
};
test("versioned design roundtrip keeps front and back independent", () => {
  const d = blankDesign();
  d.faces.front = [el];
  const parsed = parseDesign(JSON.parse(JSON.stringify(d)));
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.faces.front.length, 1);
  assert.equal(parsed.faces.back.length, 0);
});
test("unknown versions, remote images, executable fields and excessive layers rejected", () => {
  for (const d of [
    { ...blankDesign(), schemaVersion: 2 },
    {
      ...blankDesign(),
      faces: {
        front: [{ ...el, src: "https://example.com/image.svg" }],
        back: [],
      },
    },
    {
      ...blankDesign(),
      faces: { front: [{ ...el, onload: "alert(1)" }], back: [] },
    },
    { ...blankDesign(), faces: { front: Array(61).fill(el), back: [] } },
  ])
    assert.throws(() => parseDesign(d));
});
test("DPI decreases with physical print size", () => {
  assert.equal(effectiveDpi(el), 109);
  assert.equal(effectiveDpi({ ...el, scaleX: 0.5, scaleY: 0.5 }), 218);
  assert.equal(effectiveDpi({ ...el, kind: "text" }), null);
});
test("cart contains only ID and references, never artwork", () => {
  const props = lineItemProperties({
    id: "abc",
    designUrl: "https://api/d.json",
    previewUrl: "https://api/p.png",
  });
  assert.deepEqual(Object.values(props), [
    "abc",
    "https://api/d.json",
    "https://api/p.png",
    "abc",
  ]);
  assert.equal(JSON.stringify(props).includes("base64"), false);
});

test("presentation settings roundtrip without breaking legacy v1, unsafe options rejected", () => {
  const legacy = blankDesign();
  assert.equal(parseDesign(legacy).presentation, undefined);
  const presentation = {
    material: "glossy",
    background: "#dfe8f6",
    backgroundStyle: "transparent",
    exposure: 1.25,
    shadows: false,
  };
  assert.deepEqual(
    parseDesign({ ...legacy, presentation }).presentation,
    presentation,
  );
  for (const invalid of [
    { ...presentation, exposure: 100 },
    { ...presentation, background: "url(https://example.com)" },
    { ...presentation, material: "unknown" },
    { ...presentation, shadows: "yes" },
  ])
    assert.throws(() => parseDesign({ ...legacy, presentation: invalid }));
});

test("optional shape and typography fields roundtrip; legacy designs stay valid", () => {
  const d = blankDesign();
  d.faces.front = [
    {
      ...el,
      kind: "rect",
      shape: "star",
      locked: true,
      opacity: 0.5,
      flipX: true,
      flipY: false,
    },
  ];
  assert.equal(
    parseDesign(JSON.parse(JSON.stringify(d))).faces.front[0].shape,
    "star",
  );
  d.faces.back = [
    {
      ...el,
      kind: "text",
      text: "Styled",
      fontFamily: "DM Sans",
      fontSize: 36,
      fontWeight: "bold",
      fontStyle: "italic",
      underline: true,
    },
  ];
  assert.equal(parseDesign(d).faces.back[0].underline, true);
  for (const bad of [
    { opacity: 2 },
    { shape: "script" },
    { fontWeight: "expression" },
    { flipX: "yes" },
  ]) {
    assert.throws(() =>
      parseDesign({ ...d, faces: { front: [{ ...el, ...bad }], back: [] } }),
    );
  }
});
