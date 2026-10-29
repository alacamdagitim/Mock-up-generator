import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createPsdService } from "../worker/service.mjs";
const token = "test-worker-token-0123456789-abcdef";
const psd = (n = 1) => {
  const b = Buffer.alloc(80);
  b.write("8BPS");
  b.writeUInt16BE(1, 4);
  b.writeUInt16BE(3, 12);
  b.writeUInt32BE(64, 14);
  b.writeUInt32BE(64, 18);
  b.writeUInt16BE(8, 22);
  b.writeUInt16BE(3, 24);
  b[30] = n;
  return b;
};
const sample = (job) => ({
  id: `scene-${job.id}`,
  title: job.name,
  width: 64,
  height: 64,
  baseImageUrl: "/base.png",
  distribution: "public-web",
  surfaces: [
    {
      id: "front",
      face: "front",
      mapping: {
        type: "quad",
        points: [
          [0, 0],
          [64, 0],
          [64, 64],
          [0, 64],
        ],
      },
    },
  ],
});
async function serve(options, fn) {
  const dir =
    options.directory ||
    (await mkdtemp(path.join(os.tmpdir(), "psd-service-")));
  const service = await createPsdService({
    directory: dir,
    token,
    publicBase: "/worker",
    origins: ["http://127.0.0.1:5184"],
    processor: async (job) => sample(job),
    ...options,
  });
  const server = service.app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const req = (url, init = {}) =>
    fetch(base + url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...init.headers },
    });
  try {
    await fn({ service, base, req, dir });
  } finally {
    await service.close();
    await new Promise((r) => server.close(r));
    if (!options.directory) await rm(dir, { recursive: true, force: true });
  }
}
const upload = (req, n = 1, product = "product-a") =>
  req(`/admin/products/${product}/import?name=Mockup.psd`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: psd(n),
  });
async function wait(req, product = "product-a") {
  for (let i = 0; i < 100; i++) {
    const body = await (await req(`/admin/products/${product}`)).json();
    if (body.jobs.every((j) => !["queued", "processing"].includes(j.status)))
      return body;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw Error("Worker did not settle");
}
test("PSD worker refuses missing admin secret and missing public configuration", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "psd-setup-"));
  try {
    await assert.rejects(
      createPsdService({ directory: dir, token: "", publicBase: "" }),
      /PSD_ADMIN_TOKEN/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("admin upload is authenticated and origin restricted; public catalogs never reveal sources or tokens", async () =>
  serve({}, async ({ req, base }) => {
    assert.equal((await fetch(base + "/admin/products/product-a")).status, 401);
    assert.equal(
      (
        await req("/admin/products/product-a", {
          headers: { Origin: "https://evil.invalid" },
        })
      ).status,
      403,
    );
    assert.equal((await req("/catalog/unknown")).status, 200);
    const r = await upload(req);
    assert.equal(r.status, 202);
    const job = await r.json();
    await wait(req);
    const catalog = await (await fetch(base + "/catalog/product-a")).json();
    assert.equal(catalog.scenes.length, 1);
    assert.equal(JSON.stringify(catalog).includes(token), false);
    for (const file of ["source.psd", "scene.json", "validation.json"])
      assert.equal(
        (await fetch(`${base}/assets/${job.id}/${file}`)).status,
        404,
      );
    assert.equal((await req("/catalog/product-b")).status, 200);
    assert.deepEqual(
      (await (await req("/catalog/product-b")).json()).scenes,
      [],
    );
  }));
test("renamed duplicate PSD reuses the same product job; separate products remain isolated", async () =>
  serve({}, async ({ req }) => {
    const a = await (await upload(req)).json();
    await wait(req);
    const b = await (
      await req("/admin/products/product-a/import?name=Renamed.psd", {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: psd(),
      })
    ).json();
    assert.equal(a.id, b.id);
    const c = await (await upload(req, 1, "product-b")).json();
    assert.notEqual(c.id, a.id);
  }));
test("ten PSD jobs execute one at a time and catalogs preserve upload order", async () => {
  let running = 0,
    max = 0;
  await serve(
    {
      processor: async (job) => {
        running++;
        max = Math.max(max, running);
        await new Promise((r) => setTimeout(r, 8));
        running--;
        return sample(job);
      },
    },
    async ({ req }) => {
      for (let i = 0; i < 10; i++)
        assert.equal((await upload(req, i)).status, 202);
      const state = await wait(req);
      assert.equal(state.jobs.length, 10);
      assert.equal(state.catalog.scenes.length, 10);
      assert.equal(max, 1);
      assert.deepEqual(
        state.catalog.scenes.map((s) => s.id),
        state.jobs.map((j) => `scene-${j.id}`),
      );
    },
  );
});
test("unsupported PSD is explicitly marked review and never published as a successful scene", async () =>
  serve(
    {
      processor: async () => {
        const e = Error("Unsupported group mask");
        e.review = true;
        throw e;
      },
    },
    async ({ req }) => {
      await upload(req);
      const state = await wait(req);
      assert.equal(state.jobs[0].status, "review");
      assert.match(state.jobs[0].message, /group mask/);
      assert.equal(state.catalog.scenes.length, 0);
    },
  ));
test("upload size, MIME, product and filename bounds reject before decoding", async () =>
  serve({ maxBytes: 100 }, async ({ req }) => {
    assert.equal(
      (
        await req("/admin/products/product-a/import?name=wrong.jpg", {
          method: "POST",
          body: psd(),
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await req("/admin/products/product-a/import?name=mockup.psd", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: psd(),
        })
      ).status,
      415,
    );
    assert.equal(
      (
        await req("/admin/products/product-a/import?name=mockup.psd", {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: Buffer.alloc(101),
        })
      ).status,
      413,
    );
  }));
test("incorrect PSD signature returns an explicit error without queueing or publishing", async () =>
  serve({}, async ({ req }) => {
    const response = await req(
      "/admin/products/product-a/import?name=renamed.psd",
      {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: Buffer.alloc(80),
      },
    );
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /imzası/);
    assert.equal(
      (await (await req("/admin/products/product-a")).json()).jobs.length,
      0,
    );
  }));
test("ready job is durable across service restart and deleting it removes its catalog entry", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "psd-durable-"));
  try {
    let id;
    await serve({ directory: dir }, async ({ req }) => {
      id = (await (await upload(req)).json()).id;
      await wait(req);
    });
    await serve({ directory: dir }, async ({ req }) => {
      assert.equal(
        (await (await req("/catalog/product-a")).json()).scenes.length,
        1,
      );
      assert.equal(
        (await req(`/admin/jobs/${id}`, { method: "DELETE" })).status,
        204,
      );
      assert.equal(
        (await (await req("/catalog/product-a")).json()).scenes.length,
        0,
      );
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
