import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server/app.mjs";
import { blankDesign } from "../shared/schema.mjs";
const preview =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF1sAAAAASUVORK5CYII=";
async function withServer(options, fn) {
  const server = createApp(options).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((r) => server.close(r));
  }
}
test("no configuration never claims a successful save", async () => {
  await withServer({ storageDir: "", publicBase: "" }, async (base) => {
    assert.equal(
      (await (await fetch(`${base}/api/health`)).json()).storageConfigured,
      false,
    );
    assert.equal(
      (
        await fetch(`${base}/api/designs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        })
      ).status,
      503,
    );
  });
});
test("durable save, retrieval, validation, unknown ID and origin protection", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "alacam-test-"));
  try {
    await withServer(
      {
        storageDir: dir,
        publicBase: "https://design.example",
        origins: ["https://shop.example"],
      },
      async (base) => {
        const save = (body) =>
          fetch(`${base}/api/designs`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Origin: "https://shop.example",
            },
            body: JSON.stringify(body),
          });
        const design = blankDesign();
        design.presentation = {
          material: "glossy",
          background: "#e7e2f2",
          backgroundStyle: "gradient",
          exposure: 1.2,
          shadows: true,
          layout: "front-back",
          spacing: 1.2,
          lighting: "daylight",
          quality: "detail",
        };
        const r = await save({
          design,
          preview,
          productId: "123",
          variantId: "456",
        });
        assert.equal(r.status, 201);
        const saved = await r.json();
        assert.match(saved.id, /^[a-f0-9]{48}$/);
        assert.equal(
          saved.previewUrl,
          `https://design.example/api/designs/${saved.id}/preview.png`,
        );
        const stored = await fetch(
          `${base}/api/designs/${saved.id}/design.json`,
        );
        assert.deepEqual(await stored.json(), design);
        const image = await fetch(
          `${base}/api/designs/${saved.id}/preview.png`,
        );
        assert.equal(image.headers.get("content-type"), "image/png");
        assert.ok((await image.arrayBuffer()).byteLength > 30);
        assert.equal(
          (
            await save({
              design: { ...design, schemaVersion: 99 },
              preview,
              productId: "123",
              variantId: "456",
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await save({
              design,
              preview: "data:image/png;base64,YWJj",
              productId: "123",
              variantId: "456",
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await fetch(`${base}/api/health`, {
              headers: { Origin: "https://evil.example" },
            })
          ).status,
          403,
        );
        assert.equal(
          (await fetch(`${base}/api/designs/${"a".repeat(48)}/metadata.json`))
            .status,
          404,
        );
        assert.equal(
          (await fetch(`${base}/api/designs/${"a".repeat(48)}/design.json`))
            .status,
          404,
        );
        assert.equal((await readdir(dir)).length, 1);
      },
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
