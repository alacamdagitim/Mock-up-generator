import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Design,
  EditorConfig,
  Element,
  Face,
  Presentation,
  SavedDesign,
  StoreProduct,
} from "./types";
import type { EditorHandle } from "./Editor";
import type { PreviewHandle } from "./Preview";
import { renderFace } from "./Editor";
import { artworkMultiplier } from "../shared/render-quality.mjs";
import { faceBackground, withSurfaceColor } from "../shared/surface-colors.mjs";
import {
  blankDesign,
  parseDesign,
  DEFAULT_PRESENTATION,
  lineItemProperties,
} from "../shared/schema.mjs";
import { storefrontProducts, productDraftKey } from "../shared/storefront.mjs";
import { imageFile } from "./files";
import { loadProductTemplate } from "./productTemplate";
import { manufacturerDielineUrl } from "../shared/storefront.mjs";
import { projectThumbnail, storeProject } from "./library";

export const newElement = (kind: Element["kind"], name: string): Element => ({
  id: crypto.randomUUID(),
  kind,
  name,
  x: 135,
  y: 345,
  width: 330,
  height: 90,
  scaleX: 1,
  scaleY: 1,
  angle: 0,
  fill: "#202020",
});

/** The selected Shopify product enters directly into a single online-design session. */
export function useDesigner(config: EditorConfig) {
  const [keyboardScope] = useState(() => crypto.randomUUID());
  const products = storefrontProducts(config) as StoreProduct[];
  const product =
    products.find((p) => p.id === String(config.productId)) || products[0];
  const key = productDraftKey(config, product.id);
  const scope =
    config.libraryKey || config.storageKey || "alacam:standalone:v1";
  const [design, setDesign] = useState<Design>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return parseDesign(JSON.parse(raw));
    } catch {
      /* Preserve supported drafts; ignore malformed input. */
    }
    return blankDesign() as Design;
  });
  const [templateUrl, setTemplateUrl] = useState<string>();
  const [templateStatus, setTemplateStatus] = useState("");
  const [face, setFace] = useState<Face>("front");
  const faceRef = useRef(face);
  faceRef.current = face;
  const state = useRef(design);
  state.current = design;
  const [loadKey, setLoadKey] = useState(0);
  const [selected, setSelected] = useState<Element | null>(null);
  const [textures, setTextures] = useState<
    Record<Face, HTMLCanvasElement | null>
  >({ front: null, back: null });
  const [busy, setBusy] = useState(false);
  const [storage, setStorage] = useState(false);
  const [saved, setSaved] = useState<SavedDesign | null>(null);
  const [localStatus, setLocalStatus] = useState("Yerel taslak");
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(
    null,
  );
  const [variant, setVariant] = useState(() => {
    if (config.initialVariantId !== undefined) {
      const initial = product.variants.find(
        (item) =>
          String(item.id) === String(config.initialVariantId) && item.available,
      );
      return initial ? String(initial.id) : "";
    }
    return String(product.variants.find((item) => item.available)?.id || "");
  });
  const variantRef = useRef(variant);
  variantRef.current = variant;
  const [quantity, setQuantity] = useState(1);
  const [uploaded, setUploaded] = useState<Element[]>([]);
  const [historyCount, setHistoryCount] = useState([0, 0]);
  const history = useRef<Design[]>([]),
    future = useRef<Design[]>([]);
  const editor = useRef<EditorHandle>(null),
    preview = useRef<PreviewHandle>(null);
  const captureOverride = useRef<null | (() => string | Promise<string>)>(null);
  const capturePreview = useCallback(async (scale = 1) => {
    if (captureOverride.current) return await captureOverride.current();
    if (!preview.current) throw new Error("Önizleme henüz hazır değil.");
    return preview.current.png(scale);
  }, []);
  const upload = useRef<HTMLInputElement>(null),
    importer = useRef<HTMLInputElement>(null);
  const projectId = useRef<string | null>(null);
  useEffect(() => {
    try {
      projectId.current = localStorage.getItem(`${key}:project`);
    } catch {
      projectId.current = null;
    }
  }, [key]);
  const api = (config.apiBase || "/api").replace(/\/$/, "");
  const settings = {
    ...DEFAULT_PRESENTATION,
    ...design.presentation,
  } as Presentation;
  const notify = useCallback(
    (text: string, error = false) => setToast({ text, error }),
    [],
  );
  const change = useCallback((next: Design, record = true) => {
    const valid = parseDesign(next) as Design;
    if (record) {
      history.current.push(state.current);
      if (history.current.length > 35) history.current.shift();
      future.current = [];
    }
    state.current = valid;
    setDesign(valid);
    setSaved(null);
    setHistoryCount([history.current.length, future.current.length]);
  }, []);
  const dielineUrl = manufacturerDielineUrl(product.dielineUrl);
  useEffect(() => {
    setTemplateUrl(undefined);
    if (!dielineUrl) {
      setTemplateStatus(
        config.productId ? "Bıçak izi meta alanında dosya bulunamadı." : "",
      );
      return;
    }
    if (!/\.svg$/i.test(new URL(dielineUrl).pathname)) {
      setTemplateStatus(
        "Bıçak izi bağlı. Düzenleyicide göstermek için SVG dosyası gerekli; orijinal dosyayı üstteki bağlantıdan açabilirsiniz.",
      );
      return;
    }
    const controller = new AbortController();
    let active = true,
      localUrl: string | undefined;
    const timeout = window.setTimeout(() => controller.abort(), 30_000);
    setTemplateStatus("Ürünün bıçak izi yükleniyor…");
    loadProductTemplate(dielineUrl, controller.signal)
      .then(({ artboard, svg }) => {
        if (!active) return;
        localUrl = URL.createObjectURL(
          new Blob([svg], { type: "image/svg+xml" }),
        );
        setTemplateUrl(localUrl);
        const current = state.current;
        if (JSON.stringify(current.artboard) !== JSON.stringify(artboard)) {
          const old = current.artboard || {
            canvasWidth: 600,
            canvasHeight: 900,
          };
          const scale = Math.min(
            artboard.canvasWidth / old.canvasWidth,
            artboard.canvasHeight / old.canvasHeight,
          );
          const fit = (elements: Element[]) =>
            elements.map((element) => ({
              ...element,
              x:
                element.x * scale +
                (artboard.canvasWidth - old.canvasWidth * scale) / 2,
              y:
                element.y * scale +
                (artboard.canvasHeight - old.canvasHeight * scale) / 2,
              scaleX: element.scaleX * scale,
              scaleY: element.scaleY * scale,
            }));
          if (current.faces.front.length || current.faces.back.length) {
            try {
              localStorage.setItem(
                `${key}:before-template`,
                JSON.stringify(current),
              );
            } catch {
              /* Existing device storage may be full. */
            }
          }
          change(
            {
              ...current,
              artboard,
              faces: {
                front: fit(current.faces.front),
                back: fit(current.faces.back),
              },
              updatedAt: new Date().toISOString(),
            },
            false,
          );
          history.current = [];
          future.current = [];
          setHistoryCount([0, 0]);
          setSelected(null);
          setLoadKey((value) => value + 1);
        }
        setTemplateStatus(
          "Ürünün SVG bıçak izi yüklendi · Güvenli alan ve üretim onayı henüz tanımlanmadı.",
        );
      })
      .catch((error) => {
        if (active)
          setTemplateStatus(
            error instanceof Error && error.name !== "AbortError"
              ? error.message
              : "Bıçak izi yükleme süresi doldu.",
          );
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timeout);
      if (localUrl) URL.revokeObjectURL(localUrl);
    };
  }, [dielineUrl, change, key, config.productId]);
  const edit = useCallback(
    (elements: Element[]) => {
      try {
        change({
          ...state.current,
          updatedAt: new Date().toISOString(),
          faces: { ...state.current.faces, [faceRef.current]: elements },
        });
      } catch {
        notify("Öğe veya dosya sınırı aşıldı. Son işlem geri alındı.", true);
        setLoadKey((n) => n + 1);
      }
    },
    [change, notify],
  );
  const onTexture = useCallback(
    (side: Face, canvas: HTMLCanvasElement) =>
      setTextures((old) => ({ ...old, [side]: canvas })),
    [],
  );
  const undo = useCallback(
    (redo = false) => {
      const from = redo ? future.current : history.current;
      const to = redo ? history.current : future.current;
      const next = from.pop();
      if (!next) return;
      to.push(state.current);
      change(next, false);
      setSelected(null);
      setLoadKey((n) => n + 1);
    },
    [change],
  );
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify(design));
        setLocalStatus("Bu cihazda kaydedildi");
      } catch {
        setLocalStatus("Yerel kayıt başarısız");
        notify(
          "Tarayıcı depolaması dolu. Tasarımınızı JSON olarak indirin.",
          true,
        );
      }
    }, 650);
    return () => clearTimeout(timer);
  }, [design, key, notify]);
  useEffect(() => {
    const flush = () => {
      try {
        localStorage.setItem(key, JSON.stringify(state.current));
      } catch {
        /* The debounced save already exposes quota errors in the editor. */
      }
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", visibility);
      // Closing an embedded editor can unmount before its debounced save runs.
      // change() updates this ref synchronously, including edits in the close event.
      flush();
    };
  }, [key]);
  useEffect(() => {
    const abort = new AbortController();
    void fetch(`${api}/health`, { signal: abort.signal })
      .then((r) => r.json())
      .then((value) => setStorage(value.storageConfigured === true))
      .catch(() => setStorage(false));
    return () => abort.abort();
  }, [api]);
  const oppositeBackground = faceBackground(
    design,
    face === "front" ? "back" : "front",
  );
  useEffect(() => {
    const opposite = face === "front" ? "back" : "front";
    let stale = false;
    void renderFace(
      state.current.faces[opposite],
      faceBackground(state.current, opposite),
      artworkMultiplier(
        state.current.artboard?.canvasWidth || 600,
        state.current.artboard?.canvasHeight || 900,
        matchMedia("(max-width:700px)").matches ? 1536 : 2048,
      ),
      state.current.artboard,
    )
      .then((canvas) => {
        if (!stale) onTexture(opposite, canvas);
      })
      .catch(() => notify("Diğer yüzün önizlemesi hazırlanamadı.", true));
    return () => {
      stale = true;
    };
  }, [face, loadKey, oppositeBackground, design.artboard, onTexture, notify]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const path = event.composedPath();
      if (
        !path.some(
          (node) =>
            node instanceof HTMLElement &&
            node.classList.contains("online-app") &&
            node.dataset.editorScope === keyboardScope,
        ) ||
        path.some(
          (node) =>
            node instanceof HTMLElement &&
            node.getAttribute("role") === "dialog",
        )
      )
        return;
      if (
        event
          .composedPath()
          .some(
            (node) =>
              node instanceof HTMLElement &&
              (["INPUT", "TEXTAREA", "SELECT"].includes(node.tagName) ||
                node.isContentEditable),
          )
      )
        return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undo(event.shiftKey);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        undo(true);
      }
      if (event.key === "Escape") editor.current?.deselect();
      if (
        selected &&
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "d"
      ) {
        event.preventDefault();
        void editor.current
          ?.add({
            ...selected,
            id: crypto.randomUUID(),
            locked: false,
            x: Math.min(3000, selected.x + 20),
            y: Math.min(4500, selected.y + 20),
          })
          .catch((error) => notify((error as Error).message, true));
      }
      if (
        selected &&
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
      ) {
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        editor.current?.update({
          x: Math.max(
            -3000,
            Math.min(
              3000,
              selected.x +
                (event.key === "ArrowLeft"
                  ? -step
                  : event.key === "ArrowRight"
                    ? step
                    : 0),
            ),
          ),
          y: Math.max(
            -4500,
            Math.min(
              4500,
              selected.y +
                (event.key === "ArrowUp"
                  ? -step
                  : event.key === "ArrowDown"
                    ? step
                    : 0),
            ),
          ),
        });
      }
      if (["Delete", "Backspace"].includes(event.key) && selected) {
        event.preventDefault();
        editor.current?.remove();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selected, undo, notify, keyboardScope]);
  const setPresentation = (values: Partial<Presentation>) =>
    change({
      ...state.current,
      presentation: { ...settings, ...values },
      updatedAt: new Date().toISOString(),
    });
  const background = (color: string, record = true) =>
    change(
      {
        ...withSurfaceColor(state.current, faceRef.current, color),
        updatedAt: new Date().toISOString(),
      },
      record,
    );
  const add = async (element: Element, fit = true) => {
    if (!editor.current) throw new Error("Düzenleyici henüz hazır değil.");
    if (
      fit &&
      state.current.artboard &&
      !state.current.faces[faceRef.current].some(
        (item) => item.id === element.id,
      )
    ) {
      const { canvasWidth, canvasHeight } = state.current.artboard;
      const scale = Math.min(
        1,
        (canvasWidth * 0.8) / (element.width * element.scaleX),
        (canvasHeight * 0.65) / (element.height * element.scaleY),
      );
      element = {
        ...element,
        scaleX: element.scaleX * scale,
        scaleY: element.scaleY * scale,
      };
      element.x = (canvasWidth - element.width * element.scaleX) / 2;
      element.y = (canvasHeight - element.height * element.scaleY) / 2;
    }
    await editor.current.add(element);
  };
  const addImage = async (
    file?: File,
    placement: "center" | "cover" = "center",
  ) => {
    if (!file || busy) return false;
    const side = faceRef.current;
    setBusy(true);
    try {
      const data = await imageFile(file);
      if (faceRef.current !== side)
        throw new Error("Yüz değişti. Görseli yeniden ekleyin.");
      const total = Object.values(state.current.faces)
        .flat()
        .reduce((sum, element) => sum + (element.src?.length || 0), 0);
      if (total + (data.src?.length || 0) > 16_000_000)
        throw new Error("Toplam görsel verisi 16 MB sınırını aşıyor.");
      const width = state.current.artboard?.canvasWidth || 600;
      const height = state.current.artboard?.canvasHeight || 900;
      const scale =
        placement === "cover"
          ? Math.max(width / data.pixelWidth!, height / data.pixelHeight!)
          : Math.min(
              (width * 0.55) / data.pixelWidth!,
              (height * 0.55) / data.pixelHeight!,
              100,
            );
      const element = {
        ...newElement("image", file.name.slice(0, 100)),
        ...data,
        width: data.pixelWidth!,
        height: data.pixelHeight!,
        scaleX: scale,
        scaleY: scale,
        x: width / 2 - (data.pixelWidth! * scale) / 2,
        y: height / 2 - (data.pixelHeight! * scale) / 2,
      };
      await add(element, false);
      if (placement === "cover") editor.current?.layer("back");
      setUploaded((old) => [...old, element].slice(-24));
      return true;
    } catch (error) {
      notify((error as Error).message, true);
      return false;
    } finally {
      setBusy(false);
      if (upload.current) upload.current.value = "";
    }
  };
  const assets = useMemo(() => {
    const images = [
      ...uploaded,
      ...design.faces.front,
      ...design.faces.back,
    ].filter((element) => element.kind === "image");
    return images
      .filter(
        (element, index) =>
          images.findIndex((other) => other.src === element.src) === index,
      )
      .slice(-24);
  }, [uploaded, design.faces]);
  const importFile = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 20 * 1024 * 1024)
        throw new Error("JSON en fazla 20 MB olabilir.");
      change(parseDesign(JSON.parse(await file.text())) as Design);
      projectId.current = null;
      try {
        localStorage.removeItem(`${key}:project`);
      } catch {
        /* Export remains available. */
      }
      setLoadKey((n) => n + 1);
      setSelected(null);
      notify("Düzenlenebilir tasarım içe aktarıldı.");
    } catch {
      notify(
        "JSON geçersiz, desteklenmeyen sürümde veya dosya sınırını aşıyor.",
        true,
      );
    } finally {
      if (importer.current) importer.current.value = "";
    }
  };
  const persist = async (capture?: {
    snapshot: Design;
    snapshotVariant: string;
    png: string;
  }) => {
    if (!storage)
      throw new Error(
        "Sunucu depolaması bağlı değil. Bu cihazda kaydetme ve JSON indirme kullanılabilir.",
      );
    const snapshot = capture?.snapshot || state.current,
      snapshotVariant = capture?.snapshotVariant ?? variantRef.current;
    const png = capture?.png || (await capturePreview());
    if (state.current !== snapshot || variantRef.current !== snapshotVariant)
      throw new Error(
        "Kayıt sırasında tasarım değişti. Son halini yeniden kaydedin.",
      );
    const response = await fetch(`${api}/designs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        design: snapshot,
        preview: png,
        productId: product.id,
        variantId: snapshotVariant || null,
      }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Sunucuya kaydedilemedi.");
    if (!body.id || !body.designUrl || !body.previewUrl)
      throw new Error("Sunucu eksik kayıt referansı döndürdü.");
    if (state.current !== snapshot || variantRef.current !== snapshotVariant)
      throw new Error(
        "Kayıt sırasında tasarım değişti. Son halini yeniden kaydedin.",
      );
    setSaved(body as SavedDesign);
    return body as SavedDesign;
  };
  const save = async () => {
    if (busy) return null;
    setBusy(true);
    try {
      const snapshot = state.current,
        snapshotVariant = variantRef.current;
      const captureWasMockup = Boolean(captureOverride.current);
      let png: string;
      try {
        png = await capturePreview();
      } catch (error) {
        // A failed prepared scene must never be saved as a different 3D/2D image.
        if (captureWasMockup) throw error;
        png = (
          await renderFace(
            snapshot.faces.front,
            faceBackground(snapshot, "front"),
            1,
            snapshot.artboard,
          )
        ).toDataURL("image/png");
      }
      // The local thumbnail and server record share one frozen presentation.
      let localError = "";
      try {
        const thumbnail = await projectThumbnail(png);
        if (state.current !== snapshot)
          throw new Error("Tasarım değişti. Son halini yeniden kaydedin.");
        const id = projectId.current || crypto.randomUUID();
        await storeProject({
          schemaVersion: 1,
          id,
          scope,
          productId: product.id,
          productTitle: product.title,
          design: snapshot,
          thumbnail,
          updatedAt: new Date().toISOString(),
          archived: false,
        });
        if (state.current !== snapshot)
          throw new Error("Tasarım değişti. Son halini yeniden kaydedin.");
        projectId.current = id;
        localStorage.setItem(key, JSON.stringify(snapshot));
        localStorage.setItem(`${key}:project`, id);
      } catch (error) {
        localError = (error as Error).message;
      }
      if (storage) {
        try {
          const record = await persist({ snapshot, snapshotVariant, png });
          notify(
            localError
              ? `Sunucuya kaydedildi. Cihaz kaydı başarısız: ${localError}`
              : "Cihaza ve sunucuya kaydedildi.",
            Boolean(localError),
          );
          return { scope: "server" as const, ...record };
        } catch (error) {
          notify(
            `${localError ? `Cihaz kaydı başarısız: ${localError}. ` : "Bu cihazda kaydedildi. "}Sunucu kaydı başarısız: ${(error as Error).message}`,
            true,
          );
          return null;
        }
      }
      if (localError) throw new Error(localError);
      setLocalStatus("Bu cihazda kaydedildi");
      notify("Bu cihazda kaydedildi. Sunucu depolaması bağlı değil.");
      return { scope: "device" as const, localId: projectId.current };
    } catch (error) {
      notify((error as Error).message, true);
      return null;
    } finally {
      setBusy(false);
    }
  };
  const cart = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (
        !product.variants.find(
          (item) => String(item.id) === variantRef.current && item.available,
        )
      )
        throw new Error("Satışa açık bir Shopify varyantı seçin.");
      const record = saved || (await persist());
      const root = config.cartRoot || "/";
      if (!root.startsWith("/") || root.startsWith("//"))
        throw new Error("Shopify sepet kökü geçersiz.");
      const response = await fetch(`${root.replace(/\/$/, "")}/cart/add.js`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [
            {
              id: Number(variantRef.current),
              quantity,
              properties: lineItemProperties(record),
            },
          ],
        }),
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.description || "Shopify sepetine eklenemedi.");
      }
      window.location.assign(`${root.replace(/\/$/, "")}/cart`);
    } catch (error) {
      notify((error as Error).message, true);
    } finally {
      setBusy(false);
    }
  };
  return {
    keyboardScope,
    product,
    templateUrl,
    templateStatus,
    design,
    state,
    change,
    edit,
    settings,
    setPresentation,
    background,
    face,
    changeFace: (side: Face) => {
      if (!busy) {
        setFace(side);
        setSelected(null);
        preview.current?.view(side);
      }
    },
    selected,
    setSelected,
    loadKey,
    reload: () => setLoadKey((n) => n + 1),
    textures,
    onTexture,
    editor,
    preview,
    captureOverride,
    capturePreview,
    upload,
    importer,
    add,
    addImage,
    importFile,
    assets,
    undo,
    historyCount,
    busy,
    storage,
    saved,
    localStatus,
    toast,
    setToast,
    notify,
    save,
    cart,
    variant,
    setVariant: (value: string) => {
      setVariant(value);
      setSaved(null);
    },
    quantity,
    setQuantity,
  };
}
