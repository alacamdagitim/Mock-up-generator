import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { RefreshCw } from "lucide-react";
import { checkAbort, MAX_SCENE_PIXELS } from "./assets";
import { canvasDataUrl, composeMockup, loadMockupScene } from "./compositor";
import type { ArtworkProvider, LoadedMockup } from "./compositor";
import { previewResolution } from "./sampling";
import type {
  MockupPreviewHandle,
  MockupPreviewInfo,
  MockupScene,
  MockupTextures,
} from "./types";

export type MockupPreviewProps = {
  scene: MockupScene;
  active?: boolean;
  deferLoading?: boolean;
  backgroundColor?: string;
  textures: MockupTextures;
  artworkProvider?: ArtworkProvider;
  exportArtworkProvider?: ArtworkProvider;
  onReady?: (info: MockupPreviewInfo) => void;
  onStatus?: (status: "loading" | "ready" | "error", message?: string) => void;
};
export const MockupPreview = forwardRef<
  MockupPreviewHandle,
  MockupPreviewProps
>(
  (
    {
      scene,
      active = true,
      deferLoading = false,
      backgroundColor,
      textures,
      artworkProvider,
      exportArtworkProvider,
      onReady,
      onStatus,
    },
    ref,
  ) => {
    const [loaded, setLoaded] = useState<LoadedMockup | null>(null);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(!deferLoading || active);
    const [retry, setRetry] = useState(0);
    const [resolution, setResolution] = useState<{
      targetEdge: number;
      renderEdge: number;
    } | null>(null);
    const canvasHost = useRef<HTMLDivElement>(null);
    const loadedRef = useRef<LoadedMockup | null>(null);
    const propsRef = useRef({
      backgroundColor,
      textures,
      artworkProvider,
      exportArtworkProvider,
      onReady,
      onStatus,
    });
    propsRef.current = {
      backgroundColor,
      textures,
      artworkProvider,
      exportArtworkProvider,
      onReady,
      onStatus,
    };
    const exportRef = useRef<AbortController | null>(null);
    const loadRef = useRef<{
      key: string;
      controller: AbortController;
      promise: Promise<LoadedMockup>;
      value: LoadedMockup | null;
    } | null>(null);
    const ensureLoaded = useRef<() => Promise<LoadedMockup>>(async () => {
      throw new Error("Mockup sahnesi henüz hazır değil.");
    });
    const retrySceneKey = useRef<string | null>(null);
    const mounted = useRef(true);
    const sceneKey = JSON.stringify(scene);
    const requestedSceneKey = useRef(sceneKey);
    const requestKey = JSON.stringify([sceneKey, retry]);
    const requestedLoadKey = useRef(requestKey);
    requestedLoadKey.current = requestKey;
    const loadedSceneKey = useRef<string | null>(null);
    requestedSceneKey.current = sceneKey;
    useEffect(() => {
      mounted.current = true;
      return () => {
        mounted.current = false;
        exportRef.current?.abort();
      };
    }, []);
    // Viewing and exporting share one validated load. Inactive photo scenes can
    // stay lightweight until the user opens them or requests a photo download.
    ensureLoaded.current = () => {
      if (!mounted.current)
        return Promise.reject(
          new DOMException("Mockup sahnesi kapatıldı.", "AbortError"),
        );
      const existing = loadRef.current;
      if (existing?.key === requestKey) return existing.promise;
      if (existing) {
        loadRef.current = null;
        existing.controller.abort();
        existing.value?.dispose();
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45_000);
      const request = {
        key: requestKey,
        controller,
        promise: Promise.resolve().then(() =>
          loadMockupScene(scene, controller.signal),
        ),
        value: null as LoadedMockup | null,
      };
      loadRef.current = request;
      request.promise = request.promise
        .then((value) => {
          if (
            !mounted.current ||
            controller.signal.aborted ||
            loadRef.current !== request ||
            requestedLoadKey.current !== requestKey
          ) {
            value.dispose();
            throw new DOMException("Mockup işlemi iptal edildi.", "AbortError");
          }
          request.value = value;
          loadedRef.current = value;
          loadedSceneKey.current = sceneKey;
          setLoaded(value);
          setBusy(false);
          return value;
        })
        .catch((reason) => {
          if (
            mounted.current &&
            loadRef.current === request &&
            requestedLoadKey.current === requestKey
          ) {
            const message =
              reason instanceof Error && reason.name !== "AbortError"
                ? reason.message
                : "Mockup yükleme süresi doldu. Kaynak adreslerini ve CDN erişimini kontrol edin.";
            setError(message);
            setBusy(false);
            propsRef.current.onStatus?.("error", message);
          }
          throw reason;
        })
        .finally(() => clearTimeout(timeout));
      setBusy(true);
      setError("");
      propsRef.current.onStatus?.("loading");
      return request.promise;
    };
    useEffect(() => {
      exportRef.current?.abort();
      loadedRef.current = null;
      loadedSceneKey.current = null;
      setLoaded(null);
      setResolution(null);
      setBusy(false);
      setError("");
      const host = canvasHost.current;
      if (host) {
        for (const child of host.children)
          if (child instanceof HTMLCanvasElement)
            child.width = child.height = 1;
        host.replaceChildren();
      }
      return () => {
        exportRef.current?.abort();
        const request = loadRef.current;
        if (request?.key === requestKey) {
          loadRef.current = null;
          request.controller.abort();
          request.value?.dispose();
        }
        loadedRef.current = null;
        loadedSceneKey.current = null;
      };
    }, [requestKey]);
    useEffect(() => {
      if (active || !deferLoading || retrySceneKey.current === sceneKey)
        void ensureLoaded.current().catch(() => {});
    }, [requestKey, active, deferLoading]);
    useEffect(() => {
      if (!loaded || !active) return;
      const host = canvasHost.current;
      if (!host) return;
      const measure = () => {
        const bounds = host.getBoundingClientRect();
        const next = previewResolution(
          loaded.scene.width,
          loaded.scene.height,
          bounds.width,
          bounds.height,
          window.devicePixelRatio,
          matchMedia("(max-width: 760px)").matches,
        );
        setResolution((current) =>
          current?.targetEdge === next?.targetEdge &&
          current?.renderEdge === next?.renderEdge
            ? current
            : next,
        );
      };
      measure();
      const observer = new ResizeObserver(measure);
      observer.observe(host);
      // Browser zoom, screen density changes and mobile viewport resizing.
      window.addEventListener("resize", measure);
      window.visualViewport?.addEventListener("resize", measure);
      return () => {
        observer.disconnect();
        window.removeEventListener("resize", measure);
        window.visualViewport?.removeEventListener("resize", measure);
      };
    }, [loaded, active]);
    useEffect(() => {
      if (!loaded || !active || !resolution) return;
      const controller = new AbortController();
      let output: HTMLCanvasElement | null = null;
      setBusy(true);
      setError("");
      const timer = setTimeout(() => {
        composeMockup(loaded, textures, {
          maxEdge: resolution.renderEdge,
          antialias: true,
          signal: controller.signal,
          artworkProvider,
          backgroundColor,
        })
          .then((rendered) => {
            if (
              controller.signal.aborted ||
              !mounted.current ||
              requestedLoadKey.current !== requestKey
            ) {
              rendered.width = rendered.height = 1;
              return;
            }
            let value = rendered;
            if (
              resolution.targetEdge < Math.max(rendered.width, rendered.height)
            ) {
              value = document.createElement("canvas");
              const scale =
                resolution.targetEdge /
                Math.max(rendered.width, rendered.height);
              value.width = Math.max(1, Math.round(rendered.width * scale));
              value.height = Math.max(1, Math.round(rendered.height * scale));
              const context = value.getContext("2d");
              if (!context) {
                rendered.width = rendered.height = 1;
                throw new Error("Bu tarayıcı mockup önizlemesini açamadı.");
              }
              context.imageSmoothingEnabled = true;
              context.imageSmoothingQuality = "high";
              context.drawImage(rendered, 0, 0, value.width, value.height);
              rendered.width = rendered.height = 1;
            }
            output = value;
            const host = canvasHost.current;
            if (host) {
              for (const child of host.children)
                if (child instanceof HTMLCanvasElement)
                  child.width = child.height = 1;
              value.setAttribute(
                "aria-label",
                `${loaded.scene.title} mockup önizlemesi`,
              );
              value.setAttribute("role", "img");
              host.replaceChildren(value);
            }
            setBusy(false);
            const note = loaded.scene.surfaces.some((s) => !s.sourceRect)
              ? "Tanımlı yüzün tamamı kullanılıyor; sahne sabit kamera açısına sahiptir."
              : "Sabit kamera açısı · Tanımlı baskı bölgeleri kullanılıyor.";
            propsRef.current.onReady?.({
              id: loaded.scene.id,
              title: loaded.scene.title,
              width: loaded.scene.width,
              height: loaded.scene.height,
              note,
            });
            propsRef.current.onStatus?.("ready");
          })
          .catch((reason) => {
            if (controller.signal.aborted || !mounted.current) return;
            const message =
              reason instanceof Error
                ? reason.message
                : "Mockup oluşturulamadı.";
            setError(message);
            setBusy(false);
            propsRef.current.onStatus?.("error", message);
          });
      }, 45);
      return () => {
        clearTimeout(timer);
        controller.abort();
        if (output && !output.isConnected) output.width = output.height = 1;
      };
    }, [
      loaded,
      textures,
      artworkProvider,
      backgroundColor,
      resolution,
      active,
      requestKey,
    ]);
    useImperativeHandle(
      ref,
      () => ({
        dimensions: () =>
          loadedRef.current &&
          loadedSceneKey.current === requestedSceneKey.current
            ? {
                width: loadedRef.current.scene.width,
                height: loadedRef.current.scene.height,
              }
            : null,
        png: () => exportImage("image/png"),
        jpg: () => exportImage("image/jpeg"),
      }),
      [],
    );
    async function exportImage(format: "image/png" | "image/jpeg") {
      if (exportRef.current)
        throw new Error("Mockup görseli zaten hazırlanıyor.");
      const controller = new AbortController();
      const expectedLoadKey = requestedLoadKey.current;
      exportRef.current = controller;
      let output: HTMLCanvasElement | null = null;
      const frozen = new Map<string, HTMLCanvasElement>();
      try {
        const current = await ensureLoaded.current();
        checkAbort(controller.signal);
        if (
          expectedLoadKey !== requestedLoadKey.current ||
          loadedSceneKey.current !== requestedSceneKey.current
        )
          throw new DOMException("Mockup sahnesi değişti.", "AbortError");
        const currentProps = propsRef.current;
        const currentTextures = currentProps.textures;
        const provider =
          currentProps.exportArtworkProvider || currentProps.artworkProvider;
        // Freeze both faces before asynchronous pixel mapping; never mix two edits in one export.
        for (const surface of current.scene.surfaces) {
          const mode = surface.backgroundMode || "design",
            key = `${surface.face}:${mode}`;
          if (frozen.has(key)) continue;
          const source = provider
            ? await provider(surface.face, mode)
            : currentTextures[surface.face];
          if (!source)
            throw new Error("Mockup için tasarım yüzeyi henüz hazırlanmadı.");
          checkAbort(controller.signal);
          if (
            !source.width ||
            !source.height ||
            source.width * source.height > MAX_SCENE_PIXELS
          )
            throw new Error(
              "Tasarım görseli izin verilen piksel ölçüsünü aşıyor.",
            );
          const copy = document.createElement("canvas");
          copy.width = source.width;
          copy.height = source.height;
          copy.getContext("2d")!.drawImage(source, 0, 0);
          frozen.set(key, copy);
        }
        output = await composeMockup(current, currentTextures, {
          backgroundColor: currentProps.backgroundColor,
          signal: controller.signal,
          artworkProvider: (face, mode) =>
            frozen.get(`${face}:${mode}`) || null,
        });
        if (controller.signal.aborted)
          throw new DOMException("Mockup işlemi iptal edildi.", "AbortError");
        return await canvasDataUrl(output, format);
      } finally {
        for (const copy of frozen.values()) copy.width = copy.height = 1;
        if (output) output.width = output.height = 1;
        if (exportRef.current === controller) exportRef.current = null;
      }
    }
    return (
      <div
        className="mockup-preview"
        data-scene-id={scene.id}
        aria-label="Hazır mockup sahnesi"
        aria-busy={busy}
      >
        <div className="mockup-preview-canvas" ref={canvasHost} />
        {busy && !loaded && (
          <div className="mockup-preview-state" role="status">
            <span className="mockup-spinner" />
            Mockup sahnesi yükleniyor…
          </div>
        )}
        {busy && loaded && !error && (
          <div className="mockup-updating" role="status">
            <span className="mockup-spinner" />
            Tasarım uygulanıyor…
          </div>
        )}
        {error && (
          <div className="mockup-preview-state mockup-error" role="alert">
            <strong>Mockup açılamadı</strong>
            <p>{error}</p>
            <button
              onClick={() => {
                retrySceneKey.current = sceneKey;
                setRetry((v) => v + 1);
              }}
            >
              <RefreshCw size={16} />
              Yeniden dene
            </button>
          </div>
        )}
        {!error && loaded && (
          <span className="mockup-preview-caption">
            {scene.title}
            <small>
              {scene.width} × {scene.height} px · Sabit sahne
            </small>
          </span>
        )}
      </div>
    );
  },
);
MockupPreview.displayName = "MockupPreview";
