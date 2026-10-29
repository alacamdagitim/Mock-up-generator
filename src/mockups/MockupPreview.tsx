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
import type {
  MockupPreviewHandle,
  MockupPreviewInfo,
  MockupScene,
  MockupTextures,
} from "./types";

export type MockupPreviewProps = {
  scene: MockupScene;
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
    const [busy, setBusy] = useState(true);
    const [retry, setRetry] = useState(0);
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
    const mounted = useRef(true);
    const sceneKey = JSON.stringify(scene);
    const requestedSceneKey = useRef(sceneKey);
    const loadedSceneKey = useRef<string | null>(null);
    requestedSceneKey.current = sceneKey;
    useEffect(() => {
      mounted.current = true;
      return () => {
        mounted.current = false;
        exportRef.current?.abort();
      };
    }, []);
    useEffect(() => {
      const controller = new AbortController();
      let active = true,
        owned: LoadedMockup | null = null;
      exportRef.current?.abort();
      loadedRef.current = null;
      loadedSceneKey.current = null;
      setLoaded(null);
      setBusy(true);
      setError("");
      canvasHost.current?.replaceChildren();
      propsRef.current.onStatus?.("loading");
      const timeout = setTimeout(() => controller.abort(), 45_000);
      loadMockupScene(scene, controller.signal)
        .then((value) => {
          owned = value;
          if (!active) {
            value.dispose();
            return;
          }
          loadedRef.current = value;
          loadedSceneKey.current = sceneKey;
          setLoaded(value);
        })
        .catch((reason) => {
          if (!active) return;
          const message =
            reason instanceof Error && reason.name !== "AbortError"
              ? reason.message
              : "Mockup yükleme süresi doldu. Kaynak adreslerini ve CDN erişimini kontrol edin.";
          setError(message);
          setBusy(false);
          propsRef.current.onStatus?.("error", message);
        })
        .finally(() => clearTimeout(timeout));
      return () => {
        active = false;
        clearTimeout(timeout);
        controller.abort();
        owned?.dispose();
        if (loadedRef.current === owned) {
          loadedRef.current = null;
          loadedSceneKey.current = null;
        }
      };
    }, [sceneKey, retry]);
    useEffect(() => {
      if (!loaded) return;
      const controller = new AbortController();
      let output: HTMLCanvasElement | null = null;
      setBusy(true);
      setError("");
      // Small-screen editing uses fewer pixels; native export still uses the source scene.
      const mobile = matchMedia("(max-width: 760px)").matches;
      const timer = setTimeout(() => {
        composeMockup(loaded, textures, {
          maxEdge: mobile ? 960 : 1440,
          signal: controller.signal,
          artworkProvider,
          backgroundColor,
        })
          .then((value) => {
            output = value;
            if (controller.signal.aborted || !mounted.current) {
              value.width = value.height = 1;
              return;
            }
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
    }, [loaded, textures, artworkProvider, backgroundColor]);
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
      const current = loadedRef.current;
      if (!current || loadedSceneKey.current !== requestedSceneKey.current)
        throw new Error("Mockup sahnesi henüz hazır değil.");
      if (exportRef.current)
        throw new Error("Mockup görseli zaten hazırlanıyor.");
      const controller = new AbortController();
      exportRef.current = controller;
      let output: HTMLCanvasElement | null = null;
      const frozen = new Map<string, HTMLCanvasElement>();
      try {
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
            <button onClick={() => setRetry((v) => v + 1)}>
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
