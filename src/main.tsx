import { createRoot } from "react-dom/client";
import { useEffect } from "react";
import type { EditorConfig } from "./types";
import OnlineDesigner from "./OnlineDesigner";
import { storefrontProducts } from "../shared/storefront.mjs";
import css from "./styles.css?inline";
import modeSwitchCss from "./mode-switch.css?inline";
import previewWindowCss from "./preview-window.css?inline";
import previewToolbarCss from "./preview-toolbar.css?inline";
import canvasToolsCss from "./canvas-tools.css?inline";
import renderDialogCss from "./render-dialog.css?inline";
import exportPanelsCss from "./export-panels.css?inline";
import surfaceColorCss from "./surface-color.css?inline";
import mockupCss from "./mockups/mockups.css?inline";
import mockupLayoutCss from "./mockup-layout.css?inline";
import mockupWorkflowCss from "./mockup-workflow.css?inline";
import modelMappingCss from "./model-mapping.css?inline";
import orderPanelCss from "./order-panel.css?inline";
import latinFont from "@fontsource-variable/dm-sans/files/dm-sans-latin-wght-normal.woff2?url";
import extendedFont from "@fontsource-variable/dm-sans/files/dm-sans-latin-ext-wght-normal.woff2?url";
// Font faces live in the document font set; editor rules remain inside Shadow DOM.
if (!document.getElementById("alacam-editor-fonts")) {
  const fontStyle = document.createElement("style");
  fontStyle.id = "alacam-editor-fonts";
  // Keep the two subsets' actual Fontsource ranges, including Turkish letters.
  const ranges = [
    [
      extendedFont,
      "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF",
    ],
    [
      latinFont,
      "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
    ],
  ];
  fontStyle.textContent = ["Alacam UI", "DM Sans"]
    .flatMap((family) =>
      ranges.map(
        ([file, range]) =>
          `@font-face{font-family:"${family}";src:url("${file}") format("woff2");font-style:normal;font-weight:100 1000;font-display:swap;unicode-range:${range};}`,
      ),
    )
    .join("");
  document.head.append(fontStyle);
}
// Shadow DOM isolates both directions: Shopify theme styles cannot reach the editor.
type MountOptions = {
  config?: EditorConfig;
  onClose?: () => void;
  onReady?: () => void;
  fullscreen?: boolean;
};
function EditorSession({
  config,
  onClose,
  onReady,
}: {
  config: EditorConfig;
  onClose?: () => void;
  onReady?: () => void;
}) {
  useEffect(() => {
    onReady?.();
  }, [onReady]);
  return <OnlineDesigner config={config} onClose={onClose} />;
}
const mounts = new WeakMap<HTMLElement, () => void>();
export function mountEditor(host: HTMLElement, options: MountOptions = {}) {
  const existing = mounts.get(host);
  if (existing) return existing;
  let config = options.config || window.AlacamEditorConfig || {};
  try {
    if (!options.config)
      config = { ...config, ...JSON.parse(host.dataset.config || "{}") };
  } catch {
    throw new Error("Editör ayarları okunamadı.");
  }
  // Validate merchant scene data before mounting React or attaching Shadow DOM.
  if (!storefrontProducts(config).length)
    throw new Error(
      "Tasarım editörünü mağazada bir ürünün Online tasarla düğmesinden açın. Ürünün mockup, 3B model ve bıçak izi dosyaları o üründen alınır.",
    );
  const shadow = host.shadowRoot || host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = [
    css,
    modeSwitchCss,
    previewWindowCss,
    canvasToolsCss,
    previewToolbarCss,
    renderDialogCss,
    exportPanelsCss,
    surfaceColorCss,
    modelMappingCss,
    mockupCss,
    mockupLayoutCss,
    mockupWorkflowCss,
    orderPanelCss,
    options.fullscreen
      ? ".alacam-app,.online-app{height:100%;min-height:0;}"
      : "",
  ].join("\n");
  shadow.replaceChildren(style);
  const root = document.createElement("div");
  root.className = "alacam-app";
  shadow.append(root);
  const reactRoot = createRoot(root);
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    reactRoot.unmount();
    mounts.delete(host);
    host.removeEventListener("alacam:unmount", dispose);
  };
  mounts.set(host, dispose);
  host.addEventListener("alacam:unmount", dispose, { once: true });
  reactRoot.render(
    <>
      <EditorSession
        config={config}
        onClose={options.onClose}
        onReady={options.onReady}
      />
    </>,
  );
  return dispose;
}
function autoMount(host: HTMLElement) {
  try {
    mountEditor(host);
  } catch (error) {
    const page = document.createElement("main");
    page.style.cssText =
      "max-width:620px;margin:12vh auto;padding:32px;font:16px/1.7 Arial,sans-serif;color:#171717";
    const heading = document.createElement("h1");
    heading.textContent = "Alaçam · Online tasarım";
    const note = document.createElement("p");
    note.textContent =
      error instanceof Error ? error.message : "Editör açılamadı.";
    const link = document.createElement("a");
    link.href = "https://alacamdagitim.com";
    link.textContent = "Mağazaya git";
    page.append(heading, note, link);
    host.replaceChildren(page);
  }
}
const selector = "[data-alacam-editor],#alacam-editor";
document.querySelectorAll<HTMLElement>(selector).forEach(autoMount);
document.addEventListener("shopify:section:load", (e) => {
  const el = e.target as HTMLElement;
  if (el.matches?.(selector)) autoMount(el);
  el.querySelectorAll<HTMLElement>(selector).forEach(autoMount);
});
document.addEventListener("shopify:section:unload", (e) => {
  const el = e.target as HTMLElement;
  if (el.matches?.(selector)) mounts.get(el)?.();
  el.querySelectorAll<HTMLElement>(selector).forEach((host) =>
    mounts.get(host)?.(),
  );
});
