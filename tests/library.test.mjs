import test from "node:test";
import assert from "node:assert/strict";
import { libraryDocument, librarySummary } from "../shared/library.mjs";
import { blankDesign } from "../shared/schema.mjs";
const input = () => ({
  schemaVersion: 1,
  id: "11111111-1111-4111-8111-111111111111",
  scope: "alacam:qa",
  productId: "100",
  productTitle: "Beyaz doypack",
  design: blankDesign(),
  thumbnail: "data:image/webp;base64,dGVzdA==",
  updatedAt: "2026-10-27T14:00:00.000Z",
});
test("library record roundtrip retains editable design and separates lightweight card metadata", () => {
  const record = libraryDocument(input());
  assert.equal(record.archived, false);
  assert.deepEqual(libraryDocument(JSON.parse(JSON.stringify(record))), record);
  const summary = librarySummary(record);
  assert.equal(summary.name, record.design.name);
  assert.equal(summary.productId, "100");
  assert.equal("design" in summary, false);
  assert.equal("faces" in summary, false);
});
test("library rejects remote previews, unsupported design versions and oversized thumbnail data", () => {
  for (const invalid of [
    { ...input(), thumbnail: "https://example.com/x.png" },
    { ...input(), schemaVersion: 2 },
    { ...input(), design: { ...blankDesign(), schemaVersion: 2 } },
    { ...input(), thumbnail: "data:image/png;base64," + "A".repeat(700001) },
    { ...input(), id: "not-a-project-id" },
  ])
    assert.throws(() => libraryDocument(invalid));
});
test("archive state is reversible without discarding editable content", () => {
  const record = libraryDocument(input()),
    archived = libraryDocument({ ...record, archived: true });
  assert.deepEqual(archived.design, record.design);
  assert.deepEqual(libraryDocument({ ...archived, archived: false }), record);
});
