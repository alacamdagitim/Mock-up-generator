import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act } from "react";

// React determines native input support at import time. Supply a browser
// document first so jsdom does not accidentally exercise its legacy IE shim.
const bootstrapDom = new JSDOM("<div></div>");
globalThis.window = bootstrapDom.window;
globalThis.document = bootstrapDom.window.document;
globalThis.navigator = bootstrapDom.window.navigator;
const { createRoot } = await import("react-dom/client");
const { Simulate } = await import("react-dom/test-utils");
bootstrapDom.window.close();

const require = createRequire(import.meta.url);
const compiled = await build({
  entryPoints: [
    new URL("../src/MobileTextEditor.tsx", import.meta.url).pathname,
  ],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
  external: ["react", "react/jsx-runtime", "lucide-react"],
});
const source = compiled.outputFiles[0].text.replace(
  /from "(react(?:\/jsx-runtime)?|lucide-react)"/g,
  (_, packageName) =>
    `from ${JSON.stringify(pathToFileURL(require.resolve(packageName)).href)}`,
);
const { MobileTextEditor } = await import(
  "data:text/javascript;base64," + Buffer.from(source).toString("base64")
);

async function setup(onApply) {
  const dom = new JSDOM("<div id='host'></div>");
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const viewport = new dom.window.EventTarget();
  Object.assign(viewport, {
    width: 390,
    height: 844,
    offsetTop: 0,
    offsetLeft: 0,
    scale: 1,
  });
  Object.defineProperty(dom.window, "visualViewport", { value: viewport });
  dom.window.HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  dom.window.HTMLDialogElement.prototype.close = function () {
    if (!this.open) return;
    this.removeAttribute("open");
    this.dispatchEvent(new dom.window.Event("close"));
  };
  const shadow = document.querySelector("#host").attachShadow({ mode: "open" });
  const mount = document.createElement("div");
  shadow.append(mount);
  const handle = React.createRef();
  const closed = [];
  const root = createRoot(mount);
  await act(async () => {
    root.render(
      React.createElement(MobileTextEditor, {
        ref: handle,
        onApply,
        onClose: () => closed.push(true),
      }),
    );
  });
  const dialog = shadow.querySelector("dialog");
  const input = shadow.querySelector("textarea");
  const apply = () => shadow.querySelector(".mobile-text-editor-apply");
  const setText = async (value) => {
    await act(async () => {
      input.value = value;
      Simulate.change(input, { target: { value } });
    });
  };
  const dispose = async () => {
    await act(async () => root.unmount());
    dom.window.close();
  };
  return {
    dom,
    viewport,
    shadow,
    handle,
    dialog,
    input,
    apply,
    setText,
    closed,
    dispose,
  };
}

test("opening focuses a visible native textarea synchronously inside the editor shadow root", async () => {
  const calls = [];
  const app = await setup((value) => calls.push(value));
  try {
    await act(async () => {
      app.handle.current.open({
        initialText: "İyi günler, Alaçam!",
        elementId: "text-1",
      });
      assert.equal(app.dialog.open, true);
      assert.equal(
        app.shadow.activeElement,
        app.input,
        "focus happens in the same user activation, before React flushes",
      );
      assert.equal(app.input.value, "İyi günler, Alaçam!");
    });
    assert.equal(app.input.selectionStart, app.input.value.length);
    assert.equal(app.input.maxLength, 2000);
    await app.setText("İstanbul\nÖzel baskı • ŞĞÜçöı");
    await act(async () => app.apply().click());
    assert.deepEqual(calls, [
      { text: "İstanbul\nÖzel baskı • ŞĞÜçöı", elementId: "text-1" },
    ]);
    assert.equal(app.dialog.open, false);
    assert.equal(app.closed.length, 1);
  } finally {
    await app.dispose();
  }
});

test("empty text and cancel never mutate artwork; cancel discards only the input draft", async () => {
  const calls = [];
  const app = await setup((value) => calls.push(value));
  try {
    await act(async () => app.handle.current.open({ initialText: "" }));
    assert.equal(app.apply().disabled, true);
    await app.setText("   \n");
    assert.equal(app.apply().disabled, true);
    await app.setText("Henüz uygulanmadı");
    await act(async () => app.handle.current.close());
    assert.equal(app.dialog.open, false);
    assert.deepEqual(calls, []);
    await act(async () =>
      app.handle.current.open({ initialText: "Orijinal", elementId: "same" }),
    );
    assert.equal(app.input.value, "Orijinal");
  } finally {
    await app.dispose();
  }
});

test("async font/apply work prevents duplicate application and reports failure without losing text", async () => {
  let reject;
  let attempts = 0;
  const app = await setup(() => {
    attempts++;
    return new Promise((_, fail) => {
      reject = fail;
    });
  });
  try {
    await act(async () =>
      app.handle.current.open({ initialText: "Çay & kahve" }),
    );
    await act(async () => {
      app.apply().click();
      app.apply().click();
    });
    assert.equal(attempts, 1);
    assert.equal(app.apply().disabled, true);
    assert.equal(app.input.readOnly, true);
    await act(async () => app.handle.current.close());
    assert.equal(
      app.dialog.open,
      true,
      "in-flight application cannot be dismissed into a partial artwork change",
    );
    await act(async () =>
      reject(new Error("Yazı tipi yüklenemedi. Tekrar deneyin.")),
    );
    assert.equal(app.dialog.open, true);
    assert.equal(app.input.value, "Çay & kahve");
    assert.equal(app.apply().disabled, false);
    assert.match(
      app.shadow.querySelector('[role="alert"]').textContent,
      /Yazı tipi yüklenemedi/,
    );
    assert.equal(app.input.getAttribute("aria-invalid"), "true");
  } finally {
    await app.dispose();
  }
});

test("keyboard viewport changes resize the dialog while page pinch does not distort it", async () => {
  const app = await setup(() => {});
  try {
    await act(async () => app.handle.current.open({ initialText: "A" }));
    assert.equal(
      app.dialog.style.getPropertyValue("--text-editor-height"),
      "844px",
    );
    app.viewport.height = 392;
    app.viewport.offsetTop = 18;
    app.viewport.dispatchEvent(new app.dom.window.Event("resize"));
    assert.equal(
      app.dialog.style.getPropertyValue("--text-editor-height"),
      "392px",
    );
    assert.equal(
      app.dialog.style.getPropertyValue("--text-editor-top"),
      "18px",
    );
    assert.equal(
      app.dialog.dataset.compact,
      "true",
      "the iOS keyboard activates compact controls even when layout-viewport media queries do not change",
    );
    app.viewport.scale = 2;
    app.viewport.height = 196;
    app.viewport.dispatchEvent(new app.dom.window.Event("resize"));
    assert.equal(
      app.dialog.style.getPropertyValue("--text-editor-height"),
      "392px",
    );
    await act(async () => {
      const event = new app.dom.window.KeyboardEvent("keydown", {
        key: "Enter",
        ctrlKey: true,
        isComposing: true,
        bubbles: true,
      });
      app.input.dispatchEvent(event);
    });
    assert.equal(
      app.dialog.open,
      true,
      "IME confirmation does not submit the artwork text",
    );
  } finally {
    await app.dispose();
  }
});
