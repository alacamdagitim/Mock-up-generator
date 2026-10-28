import type { EditorConfig } from "./types";
import { configFromButton, validateLaunchConfig } from "./launcherConfig";

type OpenOptions = { config: EditorConfig; trigger?: HTMLElement };
type EditorModule = typeof import("./main");
type Session = {
  dialog: HTMLDialogElement;
  shell: ShadowRoot;
  host: HTMLDivElement;
  loading: HTMLDivElement;
  content: HTMLDivElement;
  trigger?: HTMLElement;
  previous: HTMLElement | null;
  scrollX: number;
  scrollY: number;
  restoreScroll: () => void;
  source: () => EditorConfig;
  promise: Promise<void>;
  dispose?: () => void;
  controller: AbortController;
  ready: boolean;
};
type Launcher = {
  open: (options: OpenOptions) => Promise<void>;
  close: () => void;
};
declare global {
  interface Window {
    AlacamEditor?: Launcher;
  }
}

const launcherStyles = `
:host { color-scheme:light; font:14px/1.5 Arial,Helvetica,sans-serif; color:#111; }
* { box-sizing:border-box; }
.session { position:relative; width:100%; height:100%; overflow:hidden; background:#f2f3f4; }
.editor { width:100%; height:100%; }
[hidden] { display:none!important; }
.loading { position:absolute; inset:0; display:flex; flex-direction:column; background:#f2f3f4; }
.loading header { height:64px; flex:none; display:flex; align-items:center; justify-content:space-between; padding:0 20px; background:#fff; box-shadow:0 2px 12px #00000008; }
.brand { font-weight:650; font-size:16px; letter-spacing:-.3px; }
button { font:inherit; cursor:pointer; color:#111; }
.close { display:grid; place-items:center; width:38px; height:38px; border:0; border-radius:6px; background:transparent; font-size:30px; line-height:1; }
.close:hover { background:#f1f1f1; }
.center { flex:1; min-height:0; display:flex; align-items:center; justify-content:center; padding:24px; text-align:center; }
.state { max-width:420px; }
.spinner { display:block; width:28px; height:28px; margin:0 auto 20px; border:2px solid #d3d5d8; border-top-color:#111; border-radius:50%; animation:turn .8s linear infinite; }
h2 { font-size:18px; line-height:1.4; margin:0 0 10px; font-weight:600; }
p { margin:0; color:#575c64; font-size:13px; line-height:1.7; overflow-wrap:anywhere; }
.retry { margin-top:20px; min-height:42px; padding:10px 24px; background:#111; color:#fff; border:0; border-radius:7px; }
button:focus-visible { outline:2px solid #6854db; outline-offset:3px; }
@keyframes turn { to { transform:rotate(360deg); } }
@media(prefers-reduced-motion:reduce) { .spinner { animation:none; } }
`;

function scrollLock() {
  const body = document.body,
    html = document.documentElement;
  const saved = [
    [
      body,
      [
        "position",
        "top",
        "left",
        "right",
        "width",
        "overflow",
        "padding-right",
      ],
    ],
    [html, ["overflow", "scroll-behavior"]],
  ] as const;
  const values = saved.flatMap(([el, keys]) =>
    keys.map((key) => ({
      el,
      key,
      value: el.style.getPropertyValue(key),
      priority: el.style.getPropertyPriority(key),
    })),
  );
  const x = window.scrollX,
    y = window.scrollY;
  const gap = Math.max(0, window.innerWidth - html.clientWidth);
  body.style.setProperty("position", "fixed", "important");
  body.style.setProperty("top", `${-y}px`, "important");
  body.style.setProperty("left", `${-x}px`, "important");
  body.style.setProperty("right", "0", "important");
  body.style.setProperty("width", "100%", "important");
  body.style.setProperty("overflow", "hidden", "important");
  if (gap)
    body.style.setProperty(
      "padding-right",
      `${parseFloat(getComputedStyle(body).paddingRight) + gap}px`,
      "important",
    );
  html.style.setProperty("overflow", "hidden", "important");
  html.style.setProperty("scroll-behavior", "auto", "important");
  return () => {
    // Keep smooth scrolling disabled until the exact stored position is restored.
    for (const { el, key, value, priority } of values.filter(
      (item) => item.key !== "scroll-behavior",
    ))
      value
        ? el.style.setProperty(key, value, priority)
        : el.style.removeProperty(key);
    window.scrollTo(x, y);
    const smooth = values.find((item) => item.key === "scroll-behavior")!;
    smooth.value
      ? html.style.setProperty(smooth.key, smooth.value, smooth.priority)
      : html.style.removeProperty(smooth.key);
  };
}

// No React/Three/Fabric request is made until the first open. The stable entry
// also supports transient entry-fetch retry without reusing a failed ESM URL.
let moduleApi: EditorModule | undefined;
let attempts = 0;
async function editorModule(): Promise<EditorModule> {
  if (moduleApi) return moduleApi;
  let url = new URL(
    import.meta.env.DEV ? "./main.tsx" : "./alacam-editor.js",
    import.meta.url,
  );
  if (!import.meta.env.DEV) {
    const self = new URL(import.meta.url);
    const tag = Array.from(document.scripts).find(
      (script) => script.src === self.href,
    );
    const entry = tag?.dataset.alacamEditorSrc;
    if (entry) {
      url = new URL(entry, document.baseURI);
      if (
        url.origin !== self.origin ||
        !url.pathname.endsWith("/alacam-editor.js")
      )
        throw new Error(
          "Editör dosya adresi tema başlatıcısıyla aynı kaynaktan gelmeli.",
        );
    } else url.search = self.search;
  }
  if (++attempts > 1) url.searchParams.set("_alacam_retry", String(Date.now()));
  let loaded: EditorModule;
  try {
    loaded = (await import(/* @vite-ignore */ url.href)) as EditorModule;
  } catch {
    throw new Error(
      "Editör dosyaları yüklenemedi. Bağlantınızı kontrol edip yeniden deneyin.",
    );
  }
  if (typeof loaded.mountEditor !== "function")
    throw new Error(
      "Editör dosyaları eksik veya eski. Güncel tema dosyalarını yükleyin.",
    );
  moduleApi = loaded;
  return loaded;
}

function install(): Launcher {
  let active: Session | undefined;
  function finish(session: Session) {
    if (active !== session) return;
    active = undefined;
    session.controller.abort();
    try {
      session.dispose?.();
    } finally {
      session.dialog.close();
      session.dialog.remove();
      session.restoreScroll();
      session.trigger?.setAttribute("aria-expanded", "false");
      session.trigger?.removeAttribute("aria-busy");
      const target = session.trigger?.isConnected
        ? session.trigger
        : session.previous;
      if (target?.isConnected) target.focus({ preventScroll: true });
    }
  }
  function close() {
    const session = active;
    if (!session) return;
    const appClose =
      session.host.shadowRoot?.querySelector<HTMLButtonElement>(
        ".online-close",
      );
    if (appClose) {
      appClose.click();
      return;
    } // Honors an in-flight Save/Cart.
    finish(session);
  }
  function focusSession(session: Session) {
    const close =
      session.host.shadowRoot?.querySelector<HTMLElement>(".online-close") ||
      session.loading.querySelector<HTMLElement>("button");
    close?.focus({ preventScroll: true });
  }
  function paintLoading(session: Session) {
    session.loading.querySelector(".state")!.replaceChildren();
    const state = session.loading.querySelector(".state")!;
    const spinner = document.createElement("i");
    spinner.className = "spinner";
    spinner.setAttribute("aria-hidden", "true");
    const title = document.createElement("h2");
    title.textContent = "Editör yükleniyor…";
    const note = document.createElement("p");
    note.textContent = "Tasarım alanınız hazırlanıyor.";
    state.append(spinner, title, note);
    state.setAttribute("role", "status");
    session.loading.hidden = false;
    session.host.hidden = true;
  }
  async function load(session: Session) {
    paintLoading(session);
    session.trigger?.setAttribute("aria-busy", "true");
    try {
      const config = session.source();
      const api = await editorModule();
      if (active !== session || session.controller.signal.aborted) return;
      session.dispose = api.mountEditor(session.host, {
        config,
        fullscreen: true,
        onClose: () => finish(session),
        onReady: () => {
          if (active !== session) return;
          session.ready = true;
          session.host.hidden = false;
          session.loading.hidden = true;
          session.trigger?.removeAttribute("aria-busy");
          focusSession(session);
        },
      });
      // Commit in a visible box so the initial canvas and ResizeObserver use
      // the real viewport rather than a display:none element's zero size.
      session.host.hidden = false;
    } catch (error) {
      if (active !== session) return;
      session.dispose?.();
      session.dispose = undefined;
      session.host.hidden = true;
      session.loading.hidden = false;
      session.trigger?.removeAttribute("aria-busy");
      const state = session.loading.querySelector(".state")!;
      state.setAttribute("role", "alert");
      const title = document.createElement("h2");
      title.textContent = "Editör açılamadı";
      const note = document.createElement("p");
      note.textContent =
        error instanceof Error
          ? error.message
          : "Bağlantıyı ve editör dosyalarını kontrol edin.";
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "retry";
      retry.textContent = "Yeniden dene";
      retry.addEventListener(
        "click",
        () => {
          void load(session);
        },
        { signal: session.controller.signal },
      );
      state.replaceChildren(title, note, retry);
    }
  }
  function begin(source: () => EditorConfig, trigger?: HTMLElement) {
    if (active) {
      focusSession(active);
      return active.promise;
    }
    const dialog = document.createElement("dialog");
    dialog.className = "alacam-editor-dialog";
    dialog.setAttribute("aria-label", "Alaçam Tasarım Editörü");
    dialog.setAttribute("aria-modal", "true");
    // Native top-layer modal is independent of transformed theme containers.
    for (const [property, value] of Object.entries({
      all: "initial",
      position: "fixed",
      inset: "0",
      width: "100dvw",
      height: "100dvh",
      "max-width": "none",
      "max-height": "none",
      margin: "0",
      padding: "0",
      border: "0",
      display: "block",
      overflow: "hidden",
      "box-sizing": "border-box",
      background: "#f2f3f4",
      opacity: "1",
      visibility: "visible",
    }))
      dialog.style.setProperty(property, value, "important");
    const shellHost = document.createElement("div");
    shellHost.style.cssText =
      "all:initial!important;display:block!important;width:100%!important;height:100%!important;margin:0!important;padding:0!important;border:0!important;box-sizing:border-box!important;";
    const shell = shellHost.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = launcherStyles;
    const content = document.createElement("div");
    content.className = "session";
    const loading = document.createElement("div");
    loading.className = "loading";
    loading.innerHTML =
      '<header><span class="brand">Alaçam · Online tasarım</span><button type="button" class="close" aria-label="Editörü kapat">×</button></header><div class="center"><div class="state"></div></div>';
    const host = document.createElement("div");
    host.className = "editor";
    content.append(host, loading);
    shell.append(style, content);
    dialog.append(shellHost);
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const session: Session = {
      dialog,
      shell,
      host,
      loading,
      content,
      trigger,
      previous,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      restoreScroll: scrollLock(),
      source,
      promise: Promise.resolve(),
      controller: new AbortController(),
      ready: false,
    };
    active = session;
    document.body.append(dialog);
    dialog.showModal();
    trigger?.setAttribute("aria-expanded", "true");
    loading
      .querySelector(".close")!
      .addEventListener("click", close, { signal: session.controller.signal });
    dialog.addEventListener(
      "cancel",
      (event) => {
        event.preventDefault();
        if (host.shadowRoot?.querySelector('[role="dialog"]')) return;
        close();
      },
      { signal: session.controller.signal },
    );
    dialog.addEventListener("close", () => finish(session), {
      signal: session.controller.signal,
    });
    focusSession(session);
    session.promise = load(session);
    return session.promise;
  }
  const api: Launcher = {
    open: ({ config, trigger }) =>
      begin(() => validateLaunchConfig(config), trigger),
    close,
  };
  document.addEventListener("click", (event) => {
    if (
      event.defaultPrevented ||
      (event instanceof MouseEvent && event.button !== 0)
    )
      return;
    const target =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-alacam-open]")
        : null;
    if (!target || target.matches(":disabled,[aria-disabled='true']")) return;
    event.preventDefault();
    void begin(() => configFromButton(target), target);
  });
  document.addEventListener("shopify:section:unload", (event) => {
    const target = event.target;
    if (
      active &&
      target instanceof Element &&
      active.trigger &&
      (target === active.trigger || target.contains(active.trigger))
    )
      finish(active);
  });
  return api;
}

// The same module can be included by several Custom Liquid blocks safely.
if (!window.AlacamEditor) window.AlacamEditor = install();
