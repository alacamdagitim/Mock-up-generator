import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

const require = createRequire(import.meta.url);
const compiled = await build({
  entryPoints: [
    new URL("../src/mockups/useMockupGallery.ts", import.meta.url).pathname,
  ],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
  external: ["react"],
  plugins: [
    {
      name: "controlled-compositor",
      setup(builder) {
        builder.onResolve({ filter: /^\.\/compositor$/ }, () => ({
          path: "compositor",
          namespace: "test",
        }));
        builder.onLoad({ filter: /.*/, namespace: "test" }, () => ({
          contents: `
          export function loadMockupScene(...args) { return globalThis.__galleryTest.load(...args); }
          export function composeMockup(...args) { return globalThis.__galleryTest.compose(...args); }
        `,
        }));
      },
    },
  ],
});
const source = compiled.outputFiles[0].text.replaceAll(
  'from "react"',
  `from ${JSON.stringify(pathToFileURL(require.resolve("react")).href)}`,
);
const { useMockupGallery } = await import(
  "data:text/javascript;base64," + Buffer.from(source).toString("base64")
);

const sleep = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
function scene(id, face = "front", mode = "design") {
  return {
    id,
    width: 1448,
    height: 1086,
    title: id,
    baseImageUrl: `https://example.com/${id}.webp`,
    surfaces: [{ face, backgroundMode: mode }],
  };
}
function setup() {
  const dom = new JSDOM("<div id='app'></div>");
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const createdUrls = [],
    revokedUrls = [],
    ownedCopies = [];
  let seq = 0;
  const createUrl = URL.createObjectURL,
    revokeUrl = URL.revokeObjectURL;
  URL.createObjectURL = () => {
    const url = `blob:gallery-test-${++seq}`;
    createdUrls.push(url);
    return url;
  };
  URL.revokeObjectURL = (url) => revokedUrls.push(url);
  dom.window.HTMLCanvasElement.prototype.getContext = function () {
    const canvas = this;
    return {
      drawImage(source) {
        canvas.dataset.content = source.dataset.content || "";
        if (source.dataset.source) ownedCopies.push(canvas);
      },
    };
  };
  const encodings = [];
  dom.window.HTMLCanvasElement.prototype.toBlob = function (
    callback,
    type,
    quality,
  ) {
    encodings.push({ width: this.width, height: this.height, type, quality });
    queueMicrotask(() => callback(new Blob(["preview"], { type })));
  };
  const state = {
    loads: [],
    compositions: [],
    live: 0,
    peak: 0,
    disposals: 0,
    beforeLoad: null,
    failOnce: new Set(),
  };
  globalThis.__galleryTest = {
    async load(value, signal) {
      state.loads.push({ id: value.id, signal });
      state.live++;
      state.peak = Math.max(state.peak, state.live);
      let disposed = false;
      const loaded = {
        scene: value,
        dispose() {
          if (disposed) return;
          disposed = true;
          state.live--;
          state.disposals++;
        },
      };
      try {
        await state.beforeLoad?.(value, signal);
        if (state.failOnce.delete(value.id))
          throw new Error("Controlled scene failure");
        return loaded;
      } catch (error) {
        loaded.dispose();
        throw error;
      }
    },
    async compose(loaded, textures, options) {
      assert.equal(options.antialias, true);
      const artwork = await options.artworkProvider(
        loaded.scene.surfaces[0].face,
        loaded.scene.surfaces[0].backgroundMode,
      );
      assert.ok(artwork.width > 1, "owned artwork is alive for composition");
      state.compositions.push({
        id: loaded.scene.id,
        content: artwork.dataset.content,
        color: options.backgroundColor,
        maxEdge: options.maxEdge,
      });
      const canvas = document.createElement("canvas");
      canvas.width = options.maxEdge;
      canvas.height = options.maxEdge * 0.75;
      return canvas;
    },
  };
  function artwork(content = "A") {
    const canvas = document.createElement("canvas");
    canvas.width = 1800;
    canvas.height = 900;
    canvas.dataset.source = "true";
    canvas.dataset.content = content;
    return canvas;
  }
  let current;
  function Harness(props) {
    current = useMockupGallery(props);
    return null;
  }
  const root = createRoot(document.getElementById("app"));
  return {
    state,
    artwork,
    ownedCopies,
    createdUrls,
    revokedUrls,
    encodings,
    get current() {
      return current;
    },
    async render(props, strict = false) {
      await act(async () => {
        root.render(
          strict
            ? React.createElement(
                React.StrictMode,
                null,
                React.createElement(Harness, props),
              )
            : React.createElement(Harness, props),
        );
        await sleep();
      });
    },
    async until(predicate, label = "gallery condition") {
      for (let i = 0; i < 150; i++) {
        if (predicate()) return;
        await act(async () => {
          await sleep(2);
        });
      }
      assert.fail(`Timed out: ${label}`);
    },
    async close() {
      await act(async () => {
        root.unmount();
        await sleep();
      });
      URL.createObjectURL = createUrl;
      URL.revokeObjectURL = revokeUrl;
      dom.window.close();
    },
  };
}

test("13 cards render serially, freeze artwork once, reuse ready previews, and invalidate only a changed scene color", async () => {
  const ui = setup();
  try {
    let providerCalls = 0;
    const original = ui.artwork();
    const scenes = Array.from({ length: 13 }, (_, i) =>
      scene(`scene-${i}`, i === 12 ? "back" : "front"),
    );
    const options = {
      scenes,
      active: true,
      revision: "design-A",
      textures: { front: original, back: original },
      artworkProvider: () => {
        providerCalls++;
        return original;
      },
    };
    await ui.render(options);
    await ui.until(
      () => ui.current.completed === 13 && !ui.current.running,
      "all 13 cards ready",
    );
    assert.equal(providerCalls, 2);
    assert.equal(ui.state.peak, 1);
    assert.equal(ui.state.live, 0);
    assert.equal(ui.state.disposals, 13);
    assert.equal(ui.createdUrls.length, 13);
    assert.ok(
      ui.encodings.every(
        (value) =>
          value.width === 640 &&
          value.height === 480 &&
          value.type === "image/webp",
      ),
    );
    assert.ok(ui.state.compositions.every((value) => value.maxEdge === 960));
    assert.ok(
      ui.ownedCopies.every((copy) => copy.width === 1 && copy.height === 1),
    );
    assert.equal(
      original.width,
      1800,
      "borrowed source canvas must remain intact",
    );
    const oldUrls = Object.fromEntries(
      Object.entries(ui.current.previews).map(([id, entry]) => [id, entry.url]),
    );

    await ui.render({
      ...options,
      scenes: scenes.map((value) => ({ ...value })),
      artworkProvider: () => {
        throw new Error("callback identity must not trigger rendering");
      },
    });
    assert.equal(ui.state.loads.length, 13);
    await ui.render({ ...options, active: false });
    assert.equal(ui.current.completed, 13);
    assert.equal(ui.current.running, false);
    await ui.render(options);
    assert.equal(
      ui.state.loads.length,
      13,
      "reopening a complete gallery reuses the cache",
    );

    await ui.render({ ...options, backgroundColors: { "scene-5": "#ff0000" } });
    await ui.until(() => ui.current.completed === 13 && !ui.current.running);
    assert.equal(ui.state.loads.length, 14);
    assert.equal(ui.state.compositions.at(-1).color, "#ff0000");
    assert.deepEqual(ui.revokedUrls, [oldUrls["scene-5"]]);
    for (const id of Object.keys(oldUrls))
      assert.equal(
        ui.current.previews[id].url === oldUrls[id],
        id !== "scene-5",
      );
  } finally {
    await ui.close();
  }
  assert.equal(
    ui.revokedUrls.length,
    14,
    "replacement and unmount revoke every owned URL exactly once",
  );
  assert.equal(new Set(ui.revokedUrls).size, 14);
});

test("a superseded revision waits for old decoding to dispose and never publishes its output", async () => {
  const ui = setup();
  let finish;
  try {
    const first = ui.artwork("A"),
      second = ui.artwork("B");
    const scenes = [scene("one"), scene("two"), scene("three")];
    let block = true;
    ui.state.beforeLoad = async () => {
      if (block) {
        block = false;
        await new Promise((resolve) => {
          finish = resolve;
        });
      }
    };
    const options = {
      scenes,
      active: true,
      revision: "A",
      textures: { front: first, back: first },
      artworkProvider: () => first,
    };
    await ui.render(options);
    await ui.until(() => ui.state.loads.length === 1);
    await ui.render({
      ...options,
      revision: "B",
      artworkProvider: () => second,
    });
    assert.equal(ui.state.loads[0].signal.aborted, true);
    assert.equal(
      ui.state.loads.length,
      1,
      "replacement cannot open a second native store before the previous finally block",
    );
    await act(async () => {
      finish();
      await sleep();
    });
    await ui.until(() => ui.current.completed === 3 && !ui.current.running);
    assert.equal(ui.state.peak, 1);
    assert.equal(ui.createdUrls.length, 3);
    assert.deepEqual(
      ui.state.compositions.map((value) => value.content),
      ["B", "B", "B"],
    );
    assert.ok(ui.ownedCopies.every((copy) => copy.width === 1));
  } finally {
    finish?.();
    await ui.close();
  }
});

test("a failed card does not block its neighbors and repeated retry clicks only rerender that card once", async () => {
  const ui = setup();
  try {
    ui.state.failOnce.add("broken");
    const original = ui.artwork();
    await ui.render({
      scenes: [scene("first"), scene("broken"), scene("last")],
      active: true,
      revision: "A",
      textures: { front: original, back: original },
    });
    await ui.until(() => !ui.current.running && ui.current.completed === 2);
    assert.equal(ui.current.previews.broken.status, "error");
    assert.equal(ui.current.previews.broken.error, "Controlled scene failure");
    const firstUrl = ui.current.previews.first.url,
      lastUrl = ui.current.previews.last.url;
    await act(async () => {
      ui.current.retry("broken");
      ui.current.retry("broken");
      ui.current.retry("first");
      ui.current.retry("missing");
      await sleep();
    });
    await ui.until(() => ui.current.completed === 3 && !ui.current.running);
    assert.equal(ui.state.loads.length, 4);
    assert.equal(ui.current.previews.first.url, firstUrl);
    assert.equal(ui.current.previews.last.url, lastUrl);
    assert.equal(ui.state.peak, 1);
  } finally {
    await ui.close();
  }
});

test("hidden mode cancels unfinished work and returns to it without rerendering completed cards", async () => {
  const ui = setup();
  let finish;
  try {
    const original = ui.artwork();
    let blocked = false;
    ui.state.beforeLoad = async (value) => {
      if (value.id === "two" && !blocked) {
        blocked = true;
        await new Promise((resolve) => {
          finish = resolve;
        });
      }
    };
    const options = {
      scenes: [scene("one"), scene("two"), scene("three")],
      active: true,
      revision: "A",
      textures: { front: original, back: original },
    };
    await ui.render(options);
    await ui.until(
      () => ui.state.loads.length === 2 && ui.current.completed === 1,
    );
    const firstUrl = ui.current.previews.one.url;
    await ui.render({ ...options, active: false });
    assert.equal(ui.current.previews.one.status, "ready");
    assert.equal(ui.current.running, false);
    assert.equal(ui.state.loads[1].signal.aborted, true);
    await act(async () => {
      finish();
      await sleep();
    });
    assert.equal(ui.createdUrls.length, 1);
    await ui.render(options);
    await ui.until(() => ui.current.completed === 3 && !ui.current.running);
    assert.equal(ui.state.loads.length, 4);
    assert.equal(ui.current.previews.one.url, firstUrl);
    assert.equal(ui.state.peak, 1);
  } finally {
    finish?.();
    await ui.close();
  }
});

test("Strict Mode replay and a different product catalog retain no old URLs or native stores", async () => {
  const ui = setup();
  try {
    const original = ui.artwork();
    const options = {
      scenes: [scene("one"), scene("two")],
      active: true,
      revision: "A",
      textures: { front: original, back: original },
    };
    await ui.render(options, true);
    await ui.until(() => ui.current.completed === 2 && !ui.current.running);
    assert.equal(ui.state.peak, 1);
    assert.equal(ui.state.loads.length, 2);
    const oldUrls = ui.createdUrls.slice();
    await ui.render({ ...options, scenes: [scene("other-product")] }, true);
    await ui.until(() => ui.current.completed === 1 && !ui.current.running);
    assert.deepEqual(Object.keys(ui.current.previews), ["other-product"]);
    assert.deepEqual(ui.revokedUrls, oldUrls);
    assert.equal(ui.state.live, 0);
  } finally {
    await ui.close();
  }
  assert.equal(ui.createdUrls.length, ui.revokedUrls.length);
});

test("a changed design exposes old previews only as stale until the new batch is ready", async () => {
  const ui = setup();
  let finish;
  try {
    const original = ui.artwork("A");
    const options = {
      scenes: [scene("one")],
      active: true,
      revision: "A",
      textures: { front: original, back: original },
    };
    await ui.render(options);
    await ui.until(() => ui.current.completed === 1 && !ui.current.running);
    const old = ui.current.previews.one.url;
    ui.state.beforeLoad = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    await ui.render({ ...options, revision: "B" });
    await ui.until(() => Boolean(finish));
    assert.equal(ui.current.previews.one.url, old);
    assert.equal(ui.current.previews.one.status, "loading");
    assert.equal(ui.current.previews.one.stale, true);
    assert.equal(ui.current.completed, 0);
    await act(async () => {
      finish();
      await sleep();
    });
    await ui.until(() => ui.current.completed === 1 && !ui.current.running);
    assert.equal(ui.current.previews.one.stale, false);
    assert.notEqual(ui.current.previews.one.url, old);
    assert.deepEqual(ui.revokedUrls, [old]);
  } finally {
    finish?.();
    await ui.close();
  }
});
