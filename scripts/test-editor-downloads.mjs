import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

const compiled = await build({
  entryPoints: [new URL("../src/download.ts", import.meta.url).pathname],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
});
const { downloadExport } = await import(
  "data:text/javascript;base64," +
    Buffer.from(compiled.outputFiles[0].text).toString("base64")
);

function setup() {
  const dom = new JSDOM("<dialog open><div id='host'></div></dialog>");
  const { document } = dom.window;
  const shadow = document.querySelector("#host").attachShadow({ mode: "open" });
  const container = document.createElement("section");
  shadow.append(container);
  const created = [], revoked = [], pending = [], activations = [];
  const saved = {
    document: globalThis.document,
    setTimeout: globalThis.setTimeout,
    createObjectURL: URL.createObjectURL,
    revokeObjectURL: URL.revokeObjectURL,
  };
  globalThis.document = document;
  globalThis.setTimeout = (callback, delay) => pending.push({ callback, delay });
  URL.createObjectURL = (blob) => {
    created.push(blob);
    return "blob:editor-download";
  };
  URL.revokeObjectURL = (url) => revoked.push(url);
  dom.window.HTMLAnchorElement.prototype.click = function () {
    activations.push({
      parent: this.parentElement,
      root: this.getRootNode(),
      href: this.href,
      filename: this.download,
      connected: this.isConnected,
    });
  };
  return {
    document, shadow, container, created, revoked, pending, activations,
    cleanup() {
      Object.assign(globalThis, {
        document: saved.document,
        setTimeout: saved.setTimeout,
      });
      URL.createObjectURL = saved.createObjectURL;
      URL.revokeObjectURL = saved.revokeObjectURL;
      dom.window.close();
    },
  };
}

test("modal exports activate a connected anchor in their own ShadowRoot and retain bytes for Safari", () => {
  const env = setup();
  try {
    const blob = new Blob(["original PNG bytes"], { type: "image/png" });
    downloadExport(blob, "tasarim.png", env.container);
    assert.deepEqual(env.created, [blob]);
    assert.deepEqual(env.activations, [{
      parent: env.container,
      root: env.shadow,
      href: "blob:editor-download",
      filename: "tasarim.png",
      connected: true,
    }]);
    assert.equal(env.container.children.length, 0);
    assert.equal(env.document.body.querySelectorAll("a").length, 0);
    assert.deepEqual(env.revoked, []);
    assert.equal(env.pending[0].delay, 60_000);
    env.pending[0].callback();
    assert.deepEqual(env.revoked, ["blob:editor-download"]);
  } finally { env.cleanup(); }
});

test("closed export containers cannot silently activate an inert body download", () => {
  const env = setup();
  try {
    env.container.remove();
    assert.throws(() => downloadExport(new Blob(), "tasarim.svg", env.container), /kapatıldı/);
    assert.throws(() => downloadExport(new Blob(), "tasarim.json", null), /kapatıldı/);
    assert.equal(env.created.length, 0);
    assert.equal(env.activations.length, 0);
  } finally { env.cleanup(); }
});

test("standalone exports retain the body fallback and failed activation releases its object URL", () => {
  const env = setup();
  try {
    downloadExport(new Blob(), "tasarim.json");
    assert.equal(env.activations[0].parent, env.document.body);
    env.document.defaultView.HTMLAnchorElement.prototype.click = () => {
      throw new Error("activation failed");
    };
    assert.throws(() => downloadExport(new Blob(), "tasarim.png", env.container), /activation failed/);
    assert.equal(env.container.children.length, 0);
    assert.deepEqual(env.revoked, ["blob:editor-download"]);
  } finally { env.cleanup(); }
});
